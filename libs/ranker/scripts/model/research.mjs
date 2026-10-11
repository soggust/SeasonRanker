// The CHECKs' news research (optional, off by default): for the biggest CHECKs a day (by their gap), Claude
// (claude-opus-5-5 with the web search tool) looks for the real-world reason the book is so far from the model
// (an injury, a role, a suspension, the weather) and answers with a structured finding: { player, status,
// reason, summary, sources }. A finding with a source that names a player out or questionable feeds the same
// injury-override path as the owner's notes (notes.mjs applyNotes: the game's own injury report), flagged
// 'research', never 'owner note'; its CHECK keeps it (research), so it's asked once.
//
//   on        only with CHECK_RESEARCH=1 and an ANTHROPIC_API_KEY, never on a --dry run (nothing spent); off,
//            the desk as it was. The SDK (@anthropic-ai/sdk) loaded only when it runs (the workflow installs
//            it first only when research is on); a client can be given (the tests' mock)
//   which    the open CHECKs (not graded, closed, bet, researched or locked), the biggest gap first, at most
//            CHECK_RESEARCH_N (TOP, 3) a sport a UTC day, counting the ones researched earlier that day
//   capped   ai-budget.mjs: the calls share the write-ups' caps ($1.50 a day, $25 a month, every sport); a
//            call goes only when ESTIMATE (its most) fits, its real usage and cost logged
//   checked  findingOf: the answer's JSON alone, its fields checked (a status out, questionable, active or
//            unknown; a reason of REASON_OF's; a summary 240 characters at most; the sources http(s) URLs, 5
//            at most); one that doesn't parse is a finding of nothing (unknown), kept so it isn't asked again
//   applied   researchNote: only a status out or questionable, with a source, whose player is the CHECK's own
//            or one the game's injury report names (his ESPN id); the owner's own note on the same CHECK wins

import { checkLocked } from './checks.mjs';
import { addUsage, costOf } from './ai-budget.mjs';

export const RESEARCH_MODEL = 'claude-opus-5-5';
export const TOP = 3;
// (a call's most: 4,000 tokens out, 40,000 in with its search results, its three searches: about $0.27)
export const MAX_TOKENS = 4000;
export const MAX_SEARCHES = 3;
export const ESTIMATE = 0.3;
// (the pauses a long search turn may take before it's left unfinished)
const MAX_TURNS = 3;
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

// A CHECK's research as a note (notes.mjs noteOf's shape, from 'research'), or null: only an out or
// questionable status with a source and a player known by his ESPN id
export function researchNote(c, rs, sport) {
  if (!rs || !['out', 'questionable'].includes(rs.status) || !rs.athlete || !/^\d{1,12}$/.test(String(rs.athlete)) || !rs.sources?.length) return null;
  return { id: c.id, reason: REASON_OF[rs.reason] ?? 'news', player: String(rs.athlete), status: rs.status, team: null, sport, note: null, by: null, at: rs.at ?? null, from: 'research' };
}

// (the SDK's client, loaded only when research runs; none installed, none)
async function defaultClient(env) {
  const mod = await import('@anthropic-ai/sdk');
  const Anthropic = mod.default ?? mod.Anthropic;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

// One CHECK researched: { finding, usage, cost, turns }. client: the SDK's (or a mock with beta.messages.create)
export async function researchOne(client, c, sport) {
  const messages = [{ role: 'user', content: researchPrompt(c, sport) }];
  let usage = {};
  let msg = null;
  let turns = 0;
  for (; turns < MAX_TURNS; turns++) {
    try {
      msg = await callOnce();
    } catch (err) {
      // (the turns before a failure were billed: their usage goes with the error, to be logged)
      if (turns) err.usage = usage;
      throw err;
    }
    usage = addUsage(usage, msg?.usage);
    // (a long search turn paused: continued with what it has so far)
    if (msg?.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: msg.content });
  }
  function callOnce() {
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
    });
  }
  const text = msg?.stop_reason === 'end_turn' ? (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n') : null;
  const finding = text ? findingOf(text) : { player: null, status: 'unknown', reason: 'none', summary: '', sources: [], problem: `stopped: ${msg?.stop_reason ?? 'no answer'}` };
  return { finding, usage, cost: costOf(usage, RESEARCH_MODEL), turns: turns + 1 };
}

// The day's research (see above): a Map of CHECK id -> its research record ({ at, by, model, status, reason,
// player, athlete, summary, sources, cost }). reportOf(c): the CHECK's game's injury report (athleteOf)
export async function researchChecks({ sport, checks = [], now = new Date(), env = process.env, dry = false, budget = null, client = null, reportOf = () => null, log = console } = {}) {
  const out = new Map();
  if (env.CHECK_RESEARCH !== '1') return out;
  if (!env.ANTHROPIC_API_KEY) {
    log.log?.(`${sport}: CHECK research on but no ANTHROPIC_API_KEY: skipped`);
    return out;
  }
  const top = Math.max(0, Math.min(10, Number.parseInt(env.CHECK_RESEARCH_N ?? '', 10) || TOP));
  const day = now.toISOString().slice(0, 10);
  const done = checks.filter((c) => String(c.research?.at ?? '').slice(0, 10) === day).length;
  const due = checks
    .filter((c) => c && !c.checkResult && !c.closedAt && !c.bet && !c.research && !checkLocked(c, now) && Date.parse(c.start) > now.getTime())
    .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
    .slice(0, Math.max(0, top - done));
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
  for (const c of due) {
    if (!budget.canSpend(ESTIMATE)) {
      log.log?.(`${sport}: CHECK research stopped at the AI caps ($${budget.left().toFixed(2)} left)`);
      break;
    }
    try {
      const { finding, usage, cost } = await researchOne(client, c, sport);
      budget.record({ what: 'check-research', sport, id: c.id, model: RESEARCH_MODEL, usage, cost });
      const athlete = finding.player ? athleteOf(c, finding.player, reportOf(c)) : null;
      const { problem: _p, ...kept } = finding;
      out.set(c.id, { at: now.toISOString(), by: 'claude', model: RESEARCH_MODEL, ...kept, athlete, cost: Math.round(cost * 1e4) / 1e4 });
      log.log?.(`${sport}: CHECK research ${c.pick ?? c.id}: ${finding.player ?? 'no one'} ${finding.status} (${finding.reason}), ${finding.sources.length} sources, $${cost.toFixed(3)}${finding.problem ? ` [${finding.problem}]` : ''}`);
    } catch (err) {
      if (err?.usage) budget.record({ what: 'check-research', sport, id: c.id, model: RESEARCH_MODEL, usage: err.usage, cost: costOf(err.usage, RESEARCH_MODEL), failed: true });
      log.warn?.(`${sport}: CHECK research on ${c.id} failed (${String(err?.message ?? err).slice(0, 120)})`);
    }
  }
  budget.save();
  return out;
}
