// The CHECKs' news research (optional, off by default): for the biggest CHECKs a day (by their gap), Claude
// (claude-opus-5-5 with the web search tool) looks for the real-world reason the book is so far from the model
// (an injury, a role, a suspension, the weather) and answers with a structured finding: { player, status,
// reason, summary, sources }. A label only: its CHECK keeps it (research), so it's asked once, and the page and
// the owner read it, but it never reaches the injury report, the prices or a bet (an LLM reading the web, with
// no person in the loop, mustn't turn a CHECK into a staked bet). Where it's right, the owner's note on the
// CHECK (notes.mjs) puts it in. researchNote (below) says what a finding would put in, for that.
//
//   timed    on the bettor's path (before pricing), so held short: each request 90 seconds at most
//            (CALL_TIMEOUT_MS) with no SDK retries, and the run's research (every sport together) stops starting
//            calls or turns RUN_DEADLINE_MS (3 minutes) after its first; a call that fails is logged (failed,
//            its cost the turns billed so far, or, where it may have been billed unseen (a timeout, a dropped
//            connection, a server error), a turn's worst case), so it counts toward its CHECK's tries
//   on        only with CHECK_RESEARCH=1 and an ANTHROPIC_API_KEY, never on a --dry run (nothing spent); off,
//            the desk as it was. The SDK (@anthropic-ai/sdk) loaded only when it runs (the workflow installs
//            it first only when research is on); a client can be given (the tests' mock)
//   which    the open CHECKs (not graded, closed, bet, researched or locked), the biggest gap first, at most
//            CHECK_RESEARCH_N (TOP, 3) a sport a UTC day, counted from the AI usage log (every CHECK asked
//            about today, kept or not) and the CHECKs researched today. A finding is logged with its call, so
//            a run that failed after paying for it (its CHECKs never saved) has it back from the log the next
//            run, never asked again; one cut short (max_tokens, its turns used up, the caps) is asked once more
//            (2 calls a CHECK at most), never kept as a finding
//   capped   ai-budget.mjs: the calls share the write-ups' caps ($1.50 a day, $25 a month, every sport); a
//            call starts only when a turn's worst case (ESTIMATE: MAX_TOKENS out, TURN_INPUT in with its
//            searches, MAX_SEARCHES searches) fits, and each paused turn is continued only when the call's cost
//            so far plus the next turn's worst case (the history re-sent, more searches) still fits: else it
//            stops there, cut short. Its real usage and cost logged
//   checked  findingOf: the answer's JSON alone (its text blocks joined as they come: the citations split a
//            reply's text mid-sentence, mid-JSON), its fields checked (a status out, questionable, active or
//            unknown; a reason of REASON_OF's; a summary 240 characters at most; the sources http(s) URLs, 5
//            at most); one that doesn't parse is a finding of nothing (unknown), kept so it isn't asked again
//   note     researchNote (not applied by the desk: what the owner's note would say): only a status out or questionable, with a source, whose player is the CHECK's own
//            or one the game's injury report names (his ESPN id); the owner's own note on the same CHECK wins.
//            The official report wins over it: not applied where the report lists him as bad or worse (never
//            Out made Questionable), nor where it lists him at all undated or dated since the research (its
//            news newer), nor where he was on the report when researched and is off it now (cleared); and a
//            finding is applied only RESEARCH_TTL_H hours (30) after it's made (one search, once: the report's
//            own word after that)

import { checkLocked } from './checks.mjs';
import { addUsage, costOf, loadSdk } from './ai-budget.mjs';
import { OUT_STATUS, Q_STATUS } from './timing.mjs';

export const RESEARCH_MODEL = 'claude-opus-5-5';
export const TOP = 3;
// (a turn's most: 8,000 tokens out (the thinking counts against it), 60,000 fresh in with its search results,
// three searches: $0.43; a continued turn's the history re-sent on top: turnEstimate)
export const MAX_TOKENS = 8000;
export const MAX_SEARCHES = 3;
export const TURN_INPUT = 60000;
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
const STATUSES = ['out', 'questionable', 'active', 'unknown'];
// (a finding's reason as the owner's notes word it: notes.mjs REASONS)
export const REASON_OF = { injury: 'news', role: 'role', suspension: 'suspension', weather: 'weather', none: 'other', other: 'other' };

const SYSTEM = `You check a sports betting model's biggest disagreements with the sportsbook. The model projects a player's stat from his game logs; when the book's line or price is far from the model, the book usually knows something the logs don't: an injury, a changed role or depth chart, a suspension, a benching, the weather. Search the news for the specific reason for the market given, from reports in the last few days before the game.

Answer with one JSON object and nothing else:
{"player": "the full name of the player whose status explains it (the prop's player, or a teammate whose absence or return moves his role)", "status": "out" | "questionable" | "active" | "unknown", "reason": "injury" | "role" | "suspension" | "weather" | "none", "summary": "one or two plain sentences, at most 240 characters, on what you found", "sources": ["the URLs of the reports you relied on"]}

status is that player's for this game: out (ruled out, inactive, suspended, on injured reserve), questionable (questionable or doubtful, a game-time decision), active (expected to play as usual), unknown (nothing found). Say unknown rather than guess, and give no status your sources don't state. reason none when nothing found explains the gap.`;

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
  };
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

// (a status's weight: out 2, questionable 1, anything else 0)
const severity = (s) => (OUT_STATUS.test(String(s ?? '')) || s === 'out' ? 2 : Q_STATUS.test(String(s ?? '')) || s === 'questionable' ? 1 : 0);

// (a player's entry on the official report (report: a Map of team id -> [{ id, status, date? }]; the notes' own
// entries, flagged from, aren't the report's), or null)
export function officialEntry(report, athlete) {
  for (const list of report instanceof Map ? report.values() : []) for (const p of list ?? []) if (!p?.from && String(p?.id) === String(athlete)) return p;
  return null;
}

// A CHECK's research as a note (notes.mjs noteOf's shape, from 'research'), or null: only an out or
// questionable status with a source and a player known by his ESPN id, made RESEARCH_TTL_H hours ago at most,
// and the official report (report: the game's, this run's) not saying otherwise (see above)
export function researchNote(c, rs, sport, { now = new Date(), report = null } = {}) {
  if (!rs || !['out', 'questionable'].includes(rs.status) || !rs.athlete || !/^\d{1,12}$/.test(String(rs.athlete)) || !rs.sources?.length) return null;
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
const RETRY = /^stopped: (max_tokens|pause_turn|the AI caps)/;

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
  const finding = text ? findingOf(text) : { player: null, status: 'unknown', reason: 'none', summary: '', sources: [], problem: `stopped: ${capped ? 'the AI caps' : (msg?.stop_reason ?? 'no answer')}` };
  // (the caps or the run's deadline: both 'the AI caps', a try cut short)
  return { finding, usage, cost: costOf(usage, RESEARCH_MODEL), turns: Math.min(turns + 1, MAX_TURNS), retry: RETRY.test(finding.problem ?? '') };
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
  const top = Math.max(0, Math.min(10, Number.parseInt(env.CHECK_RESEARCH_N ?? '', 10) || TOP));
  const day = now.toISOString().slice(0, 10);
  // (the usage log's research calls, this sport's: a CHECK's tries, and a finding paid for but never saved)
  const logged = (budget?.list?.() ?? []).filter((e) => e.what === 'check-research' && e.sport === sport && e.id);
  const tries = new Map();
  for (const e of logged) tries.set(e.id, [...(tries.get(e.id) ?? []), e]);
  const open = (c) => c && !c.checkResult && !c.closedAt && !c.research;
  for (const c of checks) {
    const kept = open(c) && (tries.get(c.id) ?? []).findLast((e) => e.finding && typeof e.finding === 'object');
    if (kept) out.set(c.id, kept.finding);
  }
  if (out.size) log.log?.(`${sport}: ${out.size} CHECK research findings back from the usage log (their run never saved them)`);
  const doneIds = new Set([...logged.filter((e) => e.at.slice(0, 10) === day).map((e) => e.id), ...checks.filter((c) => String(c.research?.at ?? '').slice(0, 10) === day).map((c) => c.id)]);
  const due = checks
    .filter((c) => open(c) && !out.has(c.id) && !c.bet && !checkLocked(c, now) && Date.parse(c.start) > now.getTime())
    // (asked before: again only when every try was cut short, MAX_TRIES at most)
    .filter((c) => {
      const t = tries.get(c.id) ?? [];
      return t.length < MAX_TRIES && t.every((e) => e.retry || e.failed);
    })
    .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
    .slice(0, Math.max(0, top - doneIds.size));
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
      log.log?.(`${sport}: CHECK research ${c.pick ?? c.id}: ${finding.player ?? 'no one'} ${finding.status} (${finding.reason}), ${finding.sources.length} sources, $${cost.toFixed(3)}${finding.problem ? ` [${finding.problem}${retry ? ', to be asked once more' : ''}]` : ''}`);
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
