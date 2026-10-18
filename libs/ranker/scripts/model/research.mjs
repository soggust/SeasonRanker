// The CHECKs' news research (optional, off by default): for every open CHECK (the biggest model Kelly first),
// Claude (claude-opus-5-5 with the web search tool) looks for the real-world reason the book is so far from the
// model (an injury, a role, a suspension, the weather, a lineup) and answers with a structured finding:
// { player, status, reason, summary, sources, explains, category, confidence }. The finding is the CHECK's
// judgment call (2026-10-17, the owner's): its CHECK keeps it (research), so it's asked once, and the verdict
// below decides what the desk does with it.
//
//   timed    on the bettor's path (before pricing), so held short: each request 90 seconds at most
//            (CALL_TIMEOUT_MS) with no SDK retries, and the run's research (every sport together) stops starting
//            calls or turns RUN_DEADLINE_MS (3 minutes) after its first; a call that fails is logged (failed,
//            its cost the turns billed so far, or, where it may have been billed unseen (a timeout, a dropped
//            connection, a server error), a turn's worst case), so it counts toward its CHECK's tries
//   on        only with CHECK_RESEARCH=1 and an ANTHROPIC_API_KEY, never on a --dry run (nothing spent); off,
//            the desk as it was. The SDK (@anthropic-ai/sdk) loaded only when it runs (the workflow installs
//            it first only when research is on); a client can be given (the tests' mock)
//   which    every open CHECK (not graded, closed, bet, researched or locked) the rule shows (checks.mjs
//            shadowOf, judged again from each one's stored fields: one it passes later in the run never paid
//            for), the biggest model Kelly first (the page's order), so when the caps bite the biggest go first;
//            at most CHECK_RESEARCH_N (TOP, 100) a sport a UTC day, counted from the research's usage log (every
//            CHECK asked about today, kept or not) and the CHECKs researched today. (The trial, 3 a day till 15
//            calls were measured, ended 2026-10-17.) A finding is logged with its call, so a run that failed
//            after paying for it (its CHECKs never saved) has it back from the log the next run, never asked
//            again; one cut short (max_tokens, its turns used up, the caps) is asked once more (2 calls a CHECK
//            at most), never kept as a finding
//   capped   ai-budget.mjs researchBudget: its own log (.cache/model/ai-usage-research.json), totals
//            (apps/nfl/scripts/model/ai-spend-research.json) and caps, apart from the write-ups' ($5 a UTC day,
//            $80 a UTC month, every sport, whichever binds first; CHECK_RESEARCH_DAILY_USD and _MONTHLY_USD lower
//            them, never raise them); a call starts only when a turn's worst case (ESTIMATE: MAX_TOKENS out,
//            TURN_INPUT in with its searches, MAX_SEARCHES searches: $0.31) fits, and each paused turn is
//            continued only when the call's cost so far plus the next turn's worst case (the history re-sent,
//            more searches) still fits: else it stops there, cut short. Its real usage and cost logged, a line a
//            call (its dollars, tokens and searches, and every call measured so far: their mean and the highest)
//   checked  findingOf: the answer's JSON alone (its text blocks joined as they come: the citations split a
//            reply's text mid-sentence, mid-JSON), its fields checked (a status of STATUSES; a reason of
//            REASON_OF's; a summary 240 characters at most; the sources http(s) URLs, 5 at most; explains a
//            boolean, else none; a category of CATEGORIES, market-only exactly when it explains nothing; a
//            confidence of CONFIDENCE, low by default); one that doesn't parse is a finding of nothing
//            (unknown, no verdict), kept so it isn't asked again
//   verdict  three ways (verdictOf; researchCall on a CHECK): (a) 'adjust': a real reason (explains true,
//            confidence high or medium) put into the model's own inputs for that game, this run alone
//            (researchNote: the player's out, doubtful, questionable or limited status into the game's injury
//            report copy, as an owner's note is, flagged research, never written to a file: the play chance, the
//            vacated volume, the QB-out flags read it); its market re-projected and re-priced by the usual rules
//            (an edge bet at RESEARCH_UNITS at most, researchAdjusted, a LIKE at most; none, passed or tracked),
//            its before and after logged. researchInputs maps it: the player's own status, a teammate's or an
//            opponent's (found by name on the game's rosters when the report hasn't him), a quarterback named to
//            start (the NFL: the others on his roster not starting, his listing cleared). A reason no input takes
//            (a role with no player's status, the weather, a player the report already has) stays a CHECK. (b) 'bet': confident there is none
//            (explains false, confidence high, with sources): the model's side bet at RESEARCH_UNITS at most
//            (researchBet, a LIKE at most), a role, news or gap CHECK whose game hasn't started. (c) 'check':
//            it can't tell (low confidence, thin or conflicting sources, a failed or cut-short call): a CHECK
//   gated    researchGateOf: each kind of research bet (bet, adjusted) off by itself, back to a label only, once
//            RESEARCH_GATE_N (40) of them graded with a close are negative in units, every sport together
//   feeds    feedCheck: a reason found tagged with whether this run's own feeds held it (the injury report, the
//            teammates out the projection saw, the news flags, the weather): inOurFeeds true (we had it, the
//            projection didn't use it: a model gap) or false (a missing source), with the feed; tallied in
//            state.json's checks.research (researchCard) and the self-check's repeat reasons (selfcheck.mjs C22)
//   note     researchNote: only a status out, doubtful, questionable or limited, with a source, whose player is
//            the CHECK's own or one the game's injury report names (his ESPN id); the owner's own note on the
//            same CHECK wins. The official report wins over it: not applied where the report lists him as bad or
//            worse (never Out made Questionable), nor where it lists him at all undated or dated since the
//            research (its news newer), nor where he was on the report when researched and is off it now
//            (cleared); and a finding is applied only RESEARCH_TTL_H hours (30) after it's made (one search,
//            once: the report's own word after that)

import { checkLocked, modelKelly, shadowOf } from './checks.mjs';
import { addUsage, costOf, loadSdk } from './ai-budget.mjs';
import { OUT_STATUS, Q_STATUS } from './timing.mjs';

export const RESEARCH_MODEL = 'claude-opus-5-5';
export const TOP = 100;
// (a turn's most: 5,000 tokens out (the thinking counts against it), 40,000 fresh in with its search results,
// five searches: $0.31; the calls measured so far ran about $0.13; a continued turn's the history re-sent on top:
// turnEstimate. Five, not two (2026-10-17): the search tool's dynamic filtering runs its searches from code, a
// loop of three queries at once, and every one counts toward max_uses; at two, the third hit max_uses_exceeded,
// the code failed, the model saw none of the results and answered "the search tool hit its usage limit", 0
// sources, on every CHECK of desk run 39085218876. A search is $0.01; the tokens are the cost)
export const MAX_TOKENS = 5000;
export const MAX_SEARCHES = 5;
export const TURN_INPUT = 40000;
// (the pauses a long search turn may take before it's left unfinished)
export const MAX_TURNS = 3;
// (a finding applied to the injury report this long after it's made, no longer)
export const RESEARCH_TTL_H = 30;
// (a CHECK asked about this many times at most, a call cut short asked once more)
const MAX_TRIES = 2;
// (a request's most, and the run's research's: on the bettor's path, so short. No SDK retries)
export const CALL_TIMEOUT_MS = 90_000;
export const RUN_DEADLINE_MS = 180_000;
// (when the run's research stops starting calls: set by its first call, every sport's together)
let runDeadline = null;
export const resetDeadline = () => {
  runDeadline = null;
};
// (a turn's worst case given the input re-sent from the turns before: its own fresh input, its whole output,
// its searches)
export const turnEstimate = (resent = 0) => costOf({ input_tokens: resent + TURN_INPUT, output_tokens: MAX_TOKENS, server_tool_use: { web_search_requests: MAX_SEARCHES } }, RESEARCH_MODEL);
export const ESTIMATE = turnEstimate(0);
const STATUSES = ['out', 'doubtful', 'questionable', 'limited', 'active', 'unknown'];
// (a finding's reason as the owner's notes word it: notes.mjs REASONS)
export const REASON_OF = { injury: 'news', role: 'role', suspension: 'suspension', weather: 'weather', lineup: 'news', none: 'other', other: 'other' };
// (the verdict's category: what the reason is, market-only exactly when nothing real was found; the owner's list)
export const CATEGORIES = {
  injury: 'Injury / limited',
  role: 'Role / depth change',
  suspension: 'Suspension / personal',
  weather: 'Weather / venue',
  lineup: 'Lineup / starter news',
  market: 'Market only (no real-world reason found)',
  other: 'Other',
};
export const CONFIDENCE = ['high', 'medium', 'low'];
// (a research bet's stake at most, a LIKE at most; and the graded-with-a-close count its gate needs)
export const RESEARCH_UNITS = 0.5;
export const RESEARCH_GATE_N = 40;
// (the CHECK causes a research bet may come from)
export const RESEARCH_CAUSES = new Set(['role', 'news', 'gap']);
// (the statuses that go into the game's injury report, as notes.mjs NOTE_STATUS words them)
export const ADJUST_STATUS = new Set(['out', 'doubtful', 'questionable', 'limited']);

const SYSTEM = `You check a sports betting model's biggest disagreements with the sportsbook. The model projects a player's stat from his game logs; when the book's line or price is far from the model, the book usually knows something the logs don't: an injury, a changed role or depth chart, a suspension, a benching, a lineup change, the weather. Search the news for the specific reason for the market given, from reports in the last few days before the game. You have ${MAX_SEARCHES} web searches in all, counting each one run from code: plan two or three focused queries (the player and his team this week, the team's injury report or depth chart for this game), not a long list. Base the answer on what the results say, and list the URLs of the results you relied on as sources.

Answer with one JSON object and nothing else:
{"player": "the full name of the player whose status explains it (the prop's player, or a teammate whose absence or return moves his role)", "status": "out" | "doubtful" | "questionable" | "limited" | "active" | "unknown", "reason": "injury" | "role" | "suspension" | "weather" | "lineup" | "none", "explains": true | false, "category": "injury" | "role" | "suspension" | "weather" | "lineup" | "market" | "other", "confidence": "high" | "medium" | "low", "summary": "one or two plain sentences, at most 240 characters, on what you found", "sources": ["the URLs of the reports you relied on"]}

status is that player's for this game: out (ruled out, inactive, suspended, on injured reserve), doubtful, questionable (a game-time decision), limited (playing on a limit: minutes, snaps, pitch count), active (expected to play as usual), unknown (nothing found). Say unknown rather than guess, and give no status your sources don't state.

explains: true when you found a real-world reason that accounts for the book's number (category: what it is: injury (or a player limited), role (a role or depth chart change), suspension (or personal), weather (or the venue), lineup (starter or lineup news), other); false when you looked and found nothing that does (category "market": the market alone, no real-world reason).
confidence: high only when your sources are current (from the last few days before this game) and agree; medium when they are current but thin or partly unclear; low when they are stale, conflicting or you could not tell. With explains false, say high only when current reports on this player, his team's depth chart or lineup, and the conditions say nothing that would move this market.`;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// (the facts sent: the CHECK's market, the model's and the book's numbers, what the diagnosis saw)
export function researchPrompt(c, sport) {
  const p = c.projection ?? {};
  const facts = {
    sport,
    game: c.matchup,
    start: c.start,
    market: c.market === 'prop' ? `${c.player} ${c.statLabel ?? c.propType} ${c.line}` : `${c.market} ${c.side} ${c.line ?? ''}`.trim(),
    player: c.player ?? null,
    modelSide: c.side,
    modelChance: c.model,
    bookChance: c.fair,
    modelProjection: fin(p.mean) ? p.mean : null,
    seasonRate: fin(p.rate) ? p.rate : null,
    recentForm: fin(p.recent) ? p.recent : null,
    teammatesOutSeen: p.out ?? [],
    diagnosis: c.diagnosis ? { cause: c.diagnosis.cause, sub: c.diagnosis.sub ?? null, why: c.diagnosis.why } : null,
  };
  return `The model's side is ${c.side} with ${Math.round((c.model ?? 0) * 100)}% against the book's ${Math.round((c.fair ?? 0) * 100)}%. What explains the book's number?\n${JSON.stringify(facts)}`;
}

// (a finding of nothing: no source, no status, no reason found. Never kept: a search that failed answers this way
// (2026-10-17: "the search tool hit its usage limit"), so it's asked once more, not judged)
export const hollow = (f) => !!f && typeof f === 'object' && !f.problem && f.status === 'unknown' && f.explains !== true && !(f.sources?.length > 0);

// (the URLs the answer's text blocks cite (web_search_result_location and the like), http(s) alone, in order, once)
export function citedUrls(content) {
  const out = [];
  for (const b of Array.isArray(content) ? content : []) {
    if (b?.type !== 'text') continue;
    for (const c of Array.isArray(b.citations) ? b.citations : []) {
      const u = typeof c?.url === 'string' ? c.url : null;
      if (u && /^https?:\/\/\S+$/.test(u) && u.length <= 500 && !out.includes(u)) out.push(u);
    }
  }
  return out;
}

// (the search tool's errors in a reply: a web_search_tool_result whose content is an error object, not a list)
export function searchErrors(content) {
  return (Array.isArray(content) ? content : []).filter((b) => b?.type === 'web_search_tool_result' && b.content && !Array.isArray(b.content)).map((b) => String(b.content.error_code ?? 'error'));
}

// A finding from the answer's text (see above): { player, status, reason, summary, sources }, or an unknown one
export function findingOf(text) {
  const none = { player: null, status: 'unknown', reason: 'none', summary: '', sources: [] };
  if (typeof text !== 'string') return { ...none, problem: 'no text' };
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  let o;
  try {
    o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null;
  } catch {
    o = null;
  }
  if (!o || typeof o !== 'object') return { ...none, problem: 'no JSON' };
  const sources = (Array.isArray(o.sources) ? o.sources : []).filter((u) => typeof u === 'string' && /^https?:\/\/\S+$/.test(u) && u.length <= 500).slice(0, 5);
  const status = STATUSES.includes(o.status) ? o.status : 'unknown';
  return {
    player: typeof o.player === 'string' && o.player.trim() ? o.player.trim().slice(0, 80) : null,
    status,
    reason: Object.hasOwn(REASON_OF, o.reason) ? o.reason : 'none',
    summary: typeof o.summary === 'string' ? o.summary.replace(/\s+/g, ' ').trim().slice(0, 240) : '',
    sources,
    ...verdictFields(o),
  };
}

// (the verdict's fields from an answer: explains a boolean (else none: no verdict), its category (market-only
// exactly when it explains nothing: a reason "market" that explains something is a contradiction, its
// confidence low), the confidence (low unless high or medium))
function verdictFields(o) {
  const explains = typeof o.explains === 'boolean' ? o.explains : null;
  let confidence = CONFIDENCE.includes(o.confidence) ? o.confidence : 'low';
  let category = Object.hasOwn(CATEGORIES, o.category) ? o.category : explains === true ? 'other' : null;
  if (explains === false) category = 'market';
  else if (explains === true && category === 'market') confidence = 'low';
  return { explains, category, confidence };
}

// A finding's verdict (see above): 'adjust' (a real reason: into the inputs where one takes it), 'bet' (confident
// there is none), 'check' (it can't tell). A finding without the verdict's fields (an older one), 'check'
export function verdictOf(rs) {
  if (!rs || typeof rs !== 'object' || rs.problem) return 'check';
  if (rs.explains === true && rs.category !== 'market' && (rs.confidence === 'high' || rs.confidence === 'medium')) return 'adjust';
  if (rs.explains === false && rs.confidence === 'high' && (rs.sources?.length ?? 0) > 0) return 'bet';
  return 'check';
}

// (a name as compared: lower case, letters alone, no suffix)
const nameKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z]/g, '');

// The player a finding names, as an ESPN id: the CHECK's own, else one the game's injury report lists by that
// name (report: a Map of team id -> [{ id, name }]), else none
export function athleteOf(c, name, report = null) {
  const k = nameKey(name);
  if (!k) return null;
  if (c.player && nameKey(c.player) === k && c.athlete !== undefined && c.athlete !== null) return String(c.athlete);
  for (const list of report instanceof Map ? report.values() : []) for (const p of list ?? []) if (nameKey(p.name) === k && p.id !== undefined) return String(p.id);
  return null;
}

// (a status's weight: out or doubtful 2, questionable or limited 1, anything else 0)
const severity = (s) => (OUT_STATUS.test(String(s ?? '')) || s === 'out' ? 2 : Q_STATUS.test(String(s ?? '')) || s === 'questionable' || s === 'limited' ? 1 : 0);

// (a player's entry on the official report (report: a Map of team id -> [{ id, status, date? }]; the notes' own
// entries, flagged from, aren't the report's), or null)
export function officialEntry(report, athlete) {
  for (const list of report instanceof Map ? report.values() : []) for (const p of list ?? []) if (!p?.from && String(p?.id) === String(athlete)) return p;
  return null;
}

// A CHECK's research as a note (notes.mjs noteOf's shape, from 'research'), or null: only an out, doubtful,
// questionable or limited status with a source and a player known by his ESPN id, made RESEARCH_TTL_H hours ago
// at most, and the official report (report: the game's, this run's) not saying otherwise (see above)
export function researchNote(c, rs, sport, { now = new Date(), report = null } = {}) {
  if (!rs || !ADJUST_STATUS.has(rs.status) || !rs.athlete || !/^\d{1,12}$/.test(String(rs.athlete)) || !rs.sources?.length) return null;
  const at = Date.parse(rs.at ?? '');
  if (!Number.isFinite(at) || now.getTime() - at > RESEARCH_TTL_H * 36e5) return null;
  const listed = officialEntry(report, rs.athlete);
  if (listed) {
    if (severity(listed.status) >= severity(rs.status)) return null;
    const dated = Date.parse(listed.date ?? '');
    if (!Number.isFinite(dated) || dated >= at) return null;
  } else if (rs.onReport) return null;
  return { id: c.id, reason: REASON_OF[rs.reason] ?? 'news', player: String(rs.athlete), status: rs.status, team: null, sport, note: null, by: null, at: rs.at ?? null, from: 'research' };
}

// (a player on one of the game's rosters (rosters: a Map of team id -> espn.mjs rosterOf's Set, its info a Map
// of id -> { name, pos }), by his ESPN id or else his name: { id, team, name, pos }, or null)
export function rosterPlayer(rosters, { id = null, name = null } = {}) {
  const k = nameKey(name);
  for (const [team, ids] of rosters instanceof Map ? rosters : []) {
    for (const [pid, x] of ids?.info ?? []) {
      if (id !== null && id !== undefined ? String(pid) === String(id) : k && nameKey(x?.name) === k) return { id: String(pid), team: String(team), name: x?.name ?? null, pos: x?.pos ?? '' };
    }
  }
  return null;
}

// (a finding that a quarterback starts: a lineup or role reason, his status active or unknown, the summary
// saying he starts)
const startsQb = (rs) => ['lineup', 'role'].some((k) => rs?.reason === k || rs?.category === k) && ['active', 'unknown'].includes(rs?.status) && /\bstart(s|ing|er)?\b|\bQB1\b/i.test(rs?.summary ?? '');

// What an 'adjust' finding puts into the model's own inputs for its game, this run alone: { notes, inputs, why }.
// notes: researchNote's shape (each id the CHECK's; its team, position and name kept so applyNotes needn't look
// them up), for the game's injury report copy; inputs: what each one changes, in words ({ name, status, kind });
// why: none taken, why; held: the input the model's already (the report has it so, or worse; a starter it
// names already), none put in, the CHECK decided by its price as it stands. Four ways (the owner's, 2026-10-17: a real reason added to the calculation, not passed):
//   own / teammate / opponent  a player's out, doubtful, questionable or limited status (the CHECK's own player,
//            a teammate whose absence moves his role, a player on the other side), the player known by his ESPN
//            id from the finding (the CHECK's own, the report's) or else by name from the game's two rosters;
//            the report's own rules decide (researchNote). Into the report, so the projection's own terms move
//            him: the play chance, the vacated volume and the next man up (vacF, nu, rp, ab), qb1Out / qbDeep
//            for a quarterback, the role guard's inputs
//   starter  (the NFL) a quarterback confirmed or named to start (startsQb): every other quarterback on his
//            roster Out for this game (not starting), so the lead quarterback the desk reads (matchups.mjs qb1,
//            context.mjs starters' usual one) is missing when he isn't the one starting; and the starter, listed
//            questionable or doubtful on a report dated before the finding, cleared. Never where the report has
//            the starter out (the report wins)
//   role     a role change with no player's status: the depth chart only gates a role CHECK (props.mjs
//            depthRoleOf), no input moves the projection: none, a CHECK
//   other    market-only, or another reason with no player's status: none, a CHECK
export function researchInputs(c, rs, sport, { now = new Date(), report = null, rosters = null } = {}) {
  const none = (why) => ({ notes: [], inputs: [], why });
  if (!rs) return none('no finding');
  const who = rs.athlete ? rosterPlayer(rosters, { id: rs.athlete }) : rosterPlayer(rosters, { name: rs.player });
  // (else by name on the game's injury report: a player on injured reserve is off the roster ESPN lists)
  const athlete = rs.athlete ? String(rs.athlete) : (who?.id ?? athleteOf(c, rs.player, report));
  const kindOf = (id, team) => (String(id) === String(c.athlete ?? '') ? 'own' : team && c.team && String(team) !== String(c.team) ? 'opponent' : 'teammate');
  if (ADJUST_STATUS.has(rs.status)) {
    if (!athlete) return none(`${rs.player ?? 'the player it names'} not known by his ESPN id (not the CHECK's player, on the report or on the game's rosters)`);
    const n = researchNote(c, { ...rs, athlete }, sport, { now, report });
    // (the report already has him so or worse, the finding fresh and sourced: the input the model's already, its
    // projection priced with it; held, so the price decides the CHECK, not the guard again (run.mjs betProps))
    const listed = n ? null : officialEntry(report, athlete);
    const at = Date.parse(rs.at ?? '');
    if (listed && severity(listed.status) >= severity(rs.status) && rs.sources?.length && Number.isFinite(at) && now.getTime() - at <= RESEARCH_TTL_H * 36e5) {
      const name = who?.name ?? listed.name ?? rs.player ?? null;
      return { notes: [], inputs: [{ name, status: String(listed.status ?? rs.status).toLowerCase(), kind: `${kindOf(athlete, who?.team ?? [...(report instanceof Map ? report : [])].find(([, l]) => (l ?? []).includes(listed))?.[0])}, on the report already` }], held: true, why: null };
    }
    if (!n) return none(`${rs.player ?? 'the player'} ${rs.status}: the report already has him so or worse, or newer, or the finding is too old or unsourced (the report's word stands)`);
    const name = who?.name ?? rs.player ?? null;
    return { notes: [{ ...n, ...(who ? { team: who.team, pos: who.pos } : {}), name }], inputs: [{ name, status: rs.status, kind: kindOf(athlete, who?.team) }], why: null };
  }
  if (sport === 'nfl' && startsQb(rs) && who?.pos === 'QB') {
    const listed = officialEntry(report, who.id);
    if (listed && OUT_STATUS.test(String(listed.status ?? ''))) return none(`${who.name} starting, but the report has him ${listed.status} (the report wins)`);
    const at = Date.parse(rs.at ?? '');
    if (!Number.isFinite(at) || now.getTime() - at > RESEARCH_TTL_H * 36e5 || !rs.sources?.length) return none('the finding too old, or without a source');
    const notes = [];
    const inputs = [];
    for (const [pid, x] of rosters?.get(who.team)?.info ?? []) {
      if (x?.pos !== 'QB' || String(pid) === who.id) continue;
      const n = researchNote(c, { ...rs, athlete: String(pid), status: 'out', reason: 'lineup', onReport: undefined }, sport, { now, report });
      if (!n) continue;
      notes.push({ ...n, team: who.team, pos: 'QB', name: x.name ?? null, starter: who.id });
      inputs.push({ name: x.name ?? `athlete ${pid}`, status: 'out', kind: `not starting (${who.name} starts)` });
    }
    if (listed && severity(listed.status) > 0) {
      const dated = Date.parse(listed.date ?? '');
      if (Number.isFinite(dated) && dated < at) {
        notes.push({ id: c.id, reason: 'news', player: who.id, status: 'active', team: who.team, pos: 'QB', name: who.name, sport, note: null, by: null, at: rs.at, from: 'research', starter: who.id });
        inputs.push({ name: who.name, status: 'active', kind: 'the starter, his listing cleared' });
      }
    }
    if (notes.length) return { notes, inputs, why: null };
    // (the report and rosters already say so: the input the model's already, held as above)
    return { notes: [], inputs: [{ name: who.name, status: 'starting', kind: 'the starter, the report and rosters say so already' }], held: true, why: null };
  }
  if (rs.category === 'role' || rs.reason === 'role') return none("a role change with no player's status: the depth chart only gates a role CHECK, no input moves the projection");
  return none("no player's status the report lacks");
}

// (the SDK's client, loaded only when research runs; none installed, none)
async function defaultClient(env) {
  const mod = await loadSdk();
  const Anthropic = mod.default ?? mod.Anthropic;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
}

// (an error that may have been billed though no usage came back: a timeout, a dropped connection, a server's.
// A request the API turned away (4xx, but a timeout's 408) was not)
export const maybeBilled = (err) => !(Number.isFinite(err?.status) && err.status >= 400 && err.status < 500 && err.status !== 408);

// (the stops that cut a call short: asked once more, never kept as a finding)
const RETRY = /^stopped: (max_tokens|pause_turn|the AI caps|nothing found)/;

// One CHECK researched: { finding, usage, cost, turns, retry }. client: the SDK's (or a mock with
// beta.messages.create); budget: ai-budget.mjs's, each continued turn only while the call's cost so far and the
// next turn's worst case fit (none: no continuation)
export async function researchOne(client, c, sport, budget = null, { deadline = Infinity, clock = Date.now } = {}) {
  const messages = [{ role: 'user', content: researchPrompt(c, sport) }];
  let usage = {};
  let msg = null;
  let turns = 0;
  let capped = false;
  for (; turns < MAX_TURNS; turns++) {
    try {
      msg = await callOnce();
    } catch (err) {
      // (the turns before a failure were billed: their usage goes with the error, to be logged)
      if (turns) err.usage = usage;
      throw err;
    }
    usage = addUsage(usage, msg?.usage);
    // (a long search turn paused: continued with what it has so far, if the caps still hold its worst case)
    if (msg?.stop_reason !== 'pause_turn' || turns + 1 >= MAX_TURNS) break;
    const resent = (msg.usage?.input_tokens ?? 0) + (msg.usage?.cache_read_input_tokens ?? 0) + (msg.usage?.cache_creation_input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);
    if (!budget?.canSpend(costOf(usage, RESEARCH_MODEL) + turnEstimate(resent)) || clock() >= deadline) {
      capped = true;
      break;
    }
    messages.push({ role: 'assistant', content: msg.content });
  }
  function callOnce() {
    // (90 seconds at most, less where the run's deadline is nearer; no retries: a failure is logged and tried
    // another run)
    const timeout = Math.max(5000, Math.min(CALL_TIMEOUT_MS, deadline - clock()));
    return client.beta.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: MAX_TOKENS,
      // (a refusal re-run on the API's own fallback, inside the same call)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }],
      messages,
    }, { timeout, maxRetries: 0 });
  }
  // (the text blocks joined as they come: the citations split one reply's text, JSON strings and all)
  const text = msg?.stop_reason === 'end_turn' ? (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('') : null;
  let finding = text ? findingOf(text) : { player: null, status: 'unknown', reason: 'none', summary: '', sources: [], problem: `stopped: ${capped ? 'the AI caps' : (msg?.stop_reason ?? 'no answer')}` };
  // (the URLs the reply cites, where the JSON's own list left them out: a finding's sources are what it read)
  if (text && !finding.problem) {
    const cited = citedUrls(msg.content).filter((u) => !finding.sources.includes(u));
    if (cited.length) finding = { ...finding, sources: [...finding.sources, ...cited].slice(0, 5) };
  }
  // (nothing found, no source: a failed search's answer, asked once more, never kept)
  if (hollow(finding)) {
    const errs = [...new Set(searchErrors(msg?.content))];
    finding = { ...finding, problem: `stopped: nothing found (no sources${errs.length ? `; search errors: ${errs.join(', ')}` : ''})` };
  }
  // (the caps or the run's deadline: both 'the AI caps', a try cut short)
  return { finding, usage, cost: costOf(usage, RESEARCH_MODEL), turns: Math.min(turns + 1, MAX_TURNS), retry: RETRY.test(finding.problem ?? '') };
}

// (the measured calls in words: "7 calls measured: mean $0.118, highest $0.201")
export function measuredWords(budget) {
  const l = budget?.life?.();
  if (!l?.calls) return 'no calls measured yet';
  return `${l.calls} call${l.calls === 1 ? '' : 's'} measured: mean $${l.mean.toFixed(3)}, highest $${l.max.toFixed(3)}`;
}

// The day's research (see above): a Map of CHECK id -> its research record ({ at, by, model, status, reason,
// player, athlete, summary, sources, cost }). reportOf(c): the CHECK's game's injury report (athleteOf)
export async function researchChecks({ sport, checks = [], now = new Date(), env = process.env, dry = false, budget = null, client = null, reportOf = () => null, log = console, clock = Date.now } = {}) {
  const out = new Map();
  if (env.CHECK_RESEARCH !== '1') return out;
  if (!env.ANTHROPIC_API_KEY) {
    log.log?.(`${sport}: CHECK research on but no ANTHROPIC_API_KEY: skipped`);
    return out;
  }
  const top = Math.max(0, Math.min(200, Number.parseInt(env.CHECK_RESEARCH_N ?? '', 10) || TOP));
  const day = now.toISOString().slice(0, 10);
  // (the usage log's research calls, this sport's: a CHECK's tries, and a finding paid for but never saved)
  const logged = (budget?.list?.() ?? []).filter((e) => e.what === 'check-research' && e.sport === sport && e.id);
  const tries = new Map();
  for (const e of logged) tries.set(e.id, [...(tries.get(e.id) ?? []), e]);
  // (a shadow (checks.mjs shadowOf: a PASS kept to grade) never: no one sees it, so nothing is spent on it)
  // (a hollow finding kept before 2026-10-17's fix (a failed search's answer) is no finding: asked again)
  const open = (c) => c && !c.hidden && !c.checkResult && !c.closedAt && (!c.research || hollow(c.research)) && !shadowOf({ cause: c.cause ?? 'gap', odds: c.odds, model: c.model, fair: c.fair, oddsAssumed: !!c.oddsAssumed });
  for (const c of checks) {
    const kept = open(c) && (tries.get(c.id) ?? []).findLast((e) => e.finding && typeof e.finding === 'object' && !hollow(e.finding));
    if (kept) out.set(c.id, kept.finding);
  }
  if (out.size) log.log?.(`${sport}: ${out.size} CHECK research findings back from the usage log (their run never saved them)`);
  const doneIds = new Set([...logged.filter((e) => e.at.slice(0, 10) === day).map((e) => e.id), ...checks.filter((c) => String(c.research?.at ?? '').slice(0, 10) === day).map((c) => c.id)]);
  const room = Math.max(0, top - doneIds.size);
  const due = checks
    .filter((c) => open(c) && !out.has(c.id) && !c.bet && !checkLocked(c, now) && Date.parse(c.start) > now.getTime())
    // (asked before: again only when every try was cut short, MAX_TRIES at most)
    .filter((c) => {
      const t = tries.get(c.id) ?? [];
      // (a hollow finding logged counts as a try cut short)
      return t.length < MAX_TRIES && t.every((e) => e.retry || e.failed || hollow(e.finding));
    })
    .sort((a, b) => (modelKelly(b.odds, b.model) ?? -9) - (modelKelly(a.odds, a.model) ?? -9))
    .slice(0, room);
  if (!due.length) return out;
  if (dry) {
    log.log?.(`${sport} (dry): CHECK research would look into ${due.length}: ${due.map((c) => c.pick ?? c.id).join(' | ')}`);
    return out;
  }
  if (!budget) {
    log.warn?.(`${sport}: CHECK research skipped (no budget to count it against)`);
    return out;
  }
  try {
    client ??= await defaultClient(env);
  } catch (err) {
    log.warn?.(`${sport}: CHECK research skipped (the Anthropic SDK not loaded: ${String(err?.message ?? err).slice(0, 100)})`);
    return out;
  }
  runDeadline ??= clock() + RUN_DEADLINE_MS;
  const deadline = runDeadline;
  for (const c of due) {
    if (clock() >= deadline) {
      log.log?.(`${sport}: CHECK research stopped at the run's deadline (${RUN_DEADLINE_MS / 1000} seconds)`);
      break;
    }
    if (!budget.canSpend(ESTIMATE)) {
      log.log?.(`${sport}: CHECK research stopped at the AI caps ($${budget.left().toFixed(2)} left)`);
      break;
    }
    try {
      const { finding, usage, cost, retry } = await researchOne(client, c, sport, budget, { deadline, clock });
      const report = reportOf(c);
      const athlete = finding.player ? athleteOf(c, finding.player, report) : null;
      const { problem: _p, ...kept } = finding;
      // (whether the official report listed him when researched: off it later, he's been cleared)
      const listed = athlete ? officialEntry(report, athlete) : null;
      const rec = retry ? null : { at: now.toISOString(), by: 'claude', model: RESEARCH_MODEL, ...kept, athlete, ...(listed ? { onReport: String(listed.status ?? '') || 'listed' } : {}), cost: Math.round(cost * 1e4) / 1e4 };
      // (the finding logged with its call: a run that fails before saving it has it back next time)
      budget.record({ what: 'check-research', sport, id: c.id, model: RESEARCH_MODEL, usage, cost, ...(rec ? { finding: rec } : { retry: true }) });
      budget.save();
      if (rec) out.set(c.id, rec);
      const n = (v) => (Number.isFinite(v) ? v : 0).toLocaleString('en-US');
      const tokens = `${n((usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0))} in, ${n(usage.output_tokens)} out, ${n(usage.server_tool_use?.web_search_requests)} searches`;
      log.log?.(`${sport}: CHECK research ${c.pick ?? c.id}: ${finding.player ?? 'no one'} ${finding.status} (${finding.reason}), ${finding.sources.length} sources; verdict ${retry ? "none yet" : verdictOf(finding)} (${finding.category ?? "no category"}, ${finding.confidence ?? "low"} confidence)${finding.problem ? ` [${finding.problem}${retry ? ', to be asked once more' : ''}]` : ''}`);
      log.log?.(`${sport}: CHECK research cost: this call $${cost.toFixed(4)} (${tokens}); ${measuredWords(budget)}; today $${budget.spent().day.toFixed(2)} of $${budget.caps?.day?.toFixed(2) ?? '?'}, month $${budget.spent().month.toFixed(2)} of $${budget.caps?.month ?? '?'}`);
      // (a call stopped at the caps: none other started)
      if (finding.problem === 'stopped: the AI caps') break;
    } catch (err) {
      // (every failed try logged, so it counts toward the CHECK's tries: its cost the turns billed before it, and
      // where this turn may have been billed unseen, its worst case on top)
      const billed = err?.usage ? costOf(err.usage, RESEARCH_MODEL) : 0;
      budget.record({ what: 'check-research', sport, id: c.id, model: RESEARCH_MODEL, usage: err?.usage ?? null, cost: billed + (maybeBilled(err) ? ESTIMATE : 0), failed: true });
      budget.save();
      log.warn?.(`${sport}: CHECK research on ${c.id} failed (${String(err?.message ?? err).slice(0, 120)})`);
    }
  }
  budget.save();
  return out;
}

// ---- the verdict on a CHECK, the gate, the feeds and the scorecard (see above) ----

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

// What the research says the desk does with a CHECK this run: { act: 'adjust' | 'bet' | 'check', why, units? }.
// rs: its research (the CHECK's own by default); gate: researchGateOf's. An 'adjust' is the run's to carry out
// (researchNote: a status into the game's report, where one takes it); a 'bet' the model's side at RESEARCH_UNITS
export function researchCall(c, rs = c?.research, { now = new Date(), gate = null } = {}) {
  const v = verdictOf(rs);
  if (v === 'check') return { act: 'check', why: rs ? `the research can't tell (${rs.problem ?? `${rs.confidence ?? 'low'} confidence`})` : 'not researched' };
  const kind = v === 'adjust' ? 'adjusted' : 'bet';
  if (gate?.[kind] && !gate[kind].on) return { act: 'check', why: gate[kind].why };
  if (!(Date.parse(c?.start ?? '') > now.getTime())) return { act: 'check', why: 'its game has started' };
  if (v === 'bet') {
    if (!RESEARCH_CAUSES.has(c?.cause ?? 'gap')) return { act: 'check', why: `a ${c?.cause} CHECK: not one a research bet comes from` };
    return { act: 'bet', units: RESEARCH_UNITS, why: `research found no real-world reason for the gap (high confidence): ${rs.summary || 'nothing found'}` };
  }
  return { act: 'adjust', why: `research found ${CATEGORIES[rs.category] ?? rs.category} (${rs.confidence} confidence): ${rs.summary || ''}`.trim() };
}

// The research bets' gate, each kind its own (bet: researchBet, adjusted: researchAdjusted), every sport's bets
// together: { bet: { on, n, units, why }, adjusted: { ... } }. Off (a label only again) once RESEARCH_GATE_N of
// that kind graded with a close are negative in units; read again every run, so it's the record that decides
export function researchGateOf(bets = []) {
  const out = {};
  for (const [kind, key, name] of [['bet', 'researchBet', 'research bets'], ['adjusted', 'researchAdjusted', 'research-adjusted bets']]) {
    // (an adjusted one its CHECK's own market alone: the game's other markets priced with it are tallied apart)
    const graded = (bets ?? []).filter((b) => b?.[key] && (kind === 'bet' || b[key].own !== false) && !b.void && ['won', 'lost', 'push'].includes(b.status) && Number.isFinite(b.clv?.ev));
    const n = graded.length;
    const units = r2(graded.reduce((t, b) => t + (b.profit ?? 0), 0));
    const on = n < RESEARCH_GATE_N || units >= 0;
    out[kind] = { on, n, units, min: RESEARCH_GATE_N, why: n < RESEARCH_GATE_N ? `${n} ${name} graded with a close: under ${RESEARCH_GATE_N}, on` : on ? `${name} ${units >= 0 ? '+' : ''}${units}u over ${n} graded with a close: on` : `${name} ${units}u over ${n} graded with a close: off, the research a label only for them` };
  }
  return out;
}

// Whether this run's own feeds held the reason a finding found (rs: its research, explains true; c: its CHECK;
// live: its game's live facts, the injury report, the news flags, the weather): { inOurFeeds, feed, feeds? }, or
// null where it found no reason. True: we had it and the projection didn't use it (a model gap); false: not in
// any feed we read (a missing source)
export function feedCheck(rs, c, live = null) {
  if (!rs || rs.explains !== true || verdictOf(rs) === 'check') return null;
  const feeds = [];
  const listed = rs.athlete ? officialEntry(live?.injuries ?? null, rs.athlete) : null;
  if (listed && severity(listed.status) > 0) feeds.push('injury report');
  const seen = (c?.projection?.out ?? []).map((x) => nameKey(typeof x === 'string' ? x : x?.name));
  if (rs.player && seen.includes(nameKey(rs.player))) feeds.push('teammates out (the projection)');
  const w = live?.weather;
  if (rs.category === 'weather' && w && ((w.wind ?? 0) >= 15 || (w.precip ?? 0) >= 0.1)) feeds.push('weather forecast');
  const team = c?.team !== undefined && c?.team !== null ? String(c.team) : null;
  if (['role', 'lineup', 'suspension', 'other'].includes(rs.category) && (live?.news ?? []).some((x) => !team || String(x.team) === team)) feeds.push('news headlines');
  return { inOurFeeds: feeds.length > 0, feed: feeds[0] ?? null, ...(feeds.length > 1 ? { feeds } : {}) };
}

// (a list of bets' tally: graded W-L-P, units, the CLV over the ones with a close, the open ones)
function betTally(list) {
  const g = list.filter((b) => !b.void && ['won', 'lost', 'push'].includes(b.status));
  const closed = g.filter((b) => Number.isFinite(b.clv?.ev));
  return {
    n: g.length,
    won: g.filter((b) => b.status === 'won').length,
    lost: g.filter((b) => b.status === 'lost').length,
    push: g.filter((b) => b.status === 'push').length,
    units: r2(g.reduce((t, b) => t + (b.profit ?? 0), 0)),
    withClose: closed.length,
    clv: closed.length ? r4(closed.reduce((t, b) => t + b.clv.ev, 0) / closed.length) : null,
    beat: closed.length ? r4(closed.filter((b) => b.clv.beat).length / closed.length) : null,
    open: list.filter((b) => !b.void && b.status === 'open').length,
  };
}

// (a list of CHECKs' tally at a unit each, as graded: what the model's side did)
function checkTally(list) {
  const g = list.filter((c) => c.checkResult && !c.checkResult.void);
  return { n: list.length, graded: g.length, won: g.filter((c) => c.checkResult.status === 'won').length, lost: g.filter((c) => c.checkResult.status === 'lost').length, units: r2(g.reduce((t, c) => t + (c.checkResult.profit ?? 0), 0)) };
}

// (what a CHECK's diagnosis calls its cause, a role's with its sub-reason: check-learn.mjs's byCause keys)
export const causeKey = (c) => (c?.diagnosis?.cause === 'role' || (!c?.diagnosis && c?.cause === 'role') ? `role:${c.diagnosis?.sub ?? c.roleReason ?? 'role'}` : (c?.diagnosis?.cause ?? c?.cause ?? 'gap'));

// The research's own scorecard (state.json's checks.research; the Algorithm desk's CHECK panel): the research
// bets and the research-adjusted bets each tallied (record, units, CLV, by category), the CHECKs researched by
// verdict and by category (the model's side at a unit, as graded), the reasons found tallied by whether our feeds
// held them (by category and cause, by feed), and each reason found lately (REASONS_KEPT days: the self-check's
// repeat reasons). bets: this sport's ledger's; checks: its CHECKs; gate: researchGateOf's
export const REASONS_KEPT = 28;
export function researchCard(bets = [], checks = [], gate = null, now = new Date()) {
  const rb = (bets ?? []).filter((b) => b?.researchBet);
  const ra = (bets ?? []).filter((b) => b?.researchAdjusted && b.researchAdjusted.own !== false);
  const rg = (bets ?? []).filter((b) => b?.researchAdjusted?.own === false);
  const byCat = (list, catOf) => {
    const out = {};
    for (const b of list) (out[catOf(b) ?? 'other'] ??= []).push(b);
    return Object.entries(out).sort();
  };
  const researched = (checks ?? []).filter((c) => c && !c.hidden && c.research);
  const verdicts = { adjust: [], bet: [], check: [] };
  for (const c of researched) verdicts[verdictOf(c.research)].push(c);
  const byCategory = {};
  for (const [cat, list] of byCat(researched, (c) => c.research.category ?? 'none')) byCategory[cat] = { ...checkTally(list), adjust: list.filter((c) => verdictOf(c.research) === 'adjust').length, bet: list.filter((c) => verdictOf(c.research) === 'bet').length, check: list.filter((c) => verdictOf(c.research) === 'check').length };
  const feeds = { inOurFeeds: {}, missing: {}, byFeed: {} };
  const reasons = [];
  const from = now.getTime() - REASONS_KEPT * 864e5;
  for (const c of researched) {
    const f = c.research.feeds;
    if (!f) continue;
    const k = `${c.research.category ?? 'other'}|${causeKey(c)}`;
    const side = f.inOurFeeds ? feeds.inOurFeeds : feeds.missing;
    side[k] = (side[k] ?? 0) + 1;
    if (f.feed) feeds.byFeed[f.feed] = (feeds.byFeed[f.feed] ?? 0) + 1;
    if (Date.parse(c.research.at ?? '') >= from) reasons.push({ at: c.research.at, id: c.id, category: c.research.category ?? 'other', status: c.research.status ?? null, cause: causeKey(c), stat: c.market === 'prop' ? (c.propType ?? null) : c.market, inOurFeeds: !!f.inOurFeeds, feed: f.feed ?? null });
  }
  const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort());
  return {
    gate,
    bets: { ...betTally(rb), byCategory: Object.fromEntries(byCat(rb, (b) => b.researchBet?.category ?? 'market').map(([k, l]) => [k, betTally(l)])) },
    adjusted: { ...betTally(ra), byCategory: Object.fromEntries(byCat(ra, (b) => b.researchAdjusted?.category ?? 'other').map(([k, l]) => [k, betTally(l)])) },
    sameGame: betTally(rg),
    researched: researched.length,
    verdicts: { adjust: checkTally(verdicts.adjust), bet: checkTally(verdicts.bet), check: checkTally(verdicts.check) },
    byCategory: sortKeys(byCategory),
    feeds: { inOurFeeds: sortKeys(feeds.inOurFeeds), missing: sortKeys(feeds.missing), byFeed: sortKeys(feeds.byFeed) },
    reasons: reasons.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 200),
  };
}
