// The CHECKs' patterns (2026-10-18, the owner's: "shouldn't CHECKs go down as we fix them?"): the research's
// findings grouped by what they found, so a CHECK of a kind the research has answered the same way, again and
// again, with a graded record that bears the answer out, is resolved by that answer directly, no research call.
// Pure: no I/O, no clock but the one given.
//
//   pattern     patternKey(c): the CHECK's cause (research.mjs causeKey: a role's with its sub-reason, else its
//               diagnosis's) and whether the feeds already showed something missing around him (seenOf: a
//               report-based role reason, qb1-out, backup-qb, group-out or part-time; or the projection's
//               teammates out or vacated work VAC_SEEN or more): known before any research, so a new CHECK's
//               pattern is its own. Kept on its research when it's made (research.pattern), the trim (checks.mjs
//               checkTrim) dropping the projection's teammates later
//   resolution  resolutionOf(c): what the research's answer did with it, the live research's or a seeded label's
//               (c.seed: a past CHECK's research made after its game, scoped to the news before it, seeded true):
//                 bet    nothing explains the gap: the model's side priced at the trust (verdict 'bet')
//                 held   a real reason the model's inputs had already (the injury report: "on the report
//                        already"; a player the projection saw out; the role guard's own report-based reason):
//                        priced at the trust as it stands
//                 pass   a real reason no input carries (a role change with no player's status): passed
//                 input  a real reason put into the inputs (a status the report lacked, a starter named): its
//                        player is the finding's, so no rule can stand in for it
//                 check  can't tell
//               A rule's own resolution (research.by 'rule') is no evidence of the share: it's what the rule chose
//   book        patternBook(checks): each pattern's researched (live and seeded alike, before the given time),
//               their resolutions counted, the top one (bet, held or pass), its share's 95% Wilson low end; and
//               the graded ones resolved that way (the research's or the rule's, a seeded one's too: weighted
//               the same once graded), their record at the price (check-learn.mjs tallyOf). The rate a new CHECK
//               of the pattern is resolved by the rule, from 0 (research every one) to MAX_RATE (the rest still
//               researched, so the pattern keeps its measure):
//                 share     (low end - SHARE_FLOOR) / (SHARE_FULL - SHARE_FLOOR), held to 0..1
//                 support   the hit rate shrunk toward the break-even by SUPPORT_K (hs = (won + K be) / (decided
//                           + K)), m = hs - be: bet and held 0.5 + m / (2 SUPPORT_SPAN), a pass 0.5 - m / (2
//                           SUPPORT_SPAN), held to 0..1: half at the break-even (the rule decides as the research
//                           would, so an even record halves it), none SUPPORT_SPAN the wrong side of it
//                 evidence  decided / (decided + EVIDENCE_G): a pattern with nothing graded resolves nothing
//               rate = MAX_RATE x share x support x evidence. Read again every run: a pattern whose results turn
//               bad, or whose research stops agreeing, falls back to research by itself
//   which       preResolve(c, book): a CHECK resolved by its pattern's rule where its own draw (unitOf: its id
//               hashed, 0 to 1, the same every run) is under the rate; one resolved by the rule before kept while
//               its draw is under the rate plus KEEP_SLACK (no flip-flopping on a small move), dropped (back to
//               research) once it isn't
//   finding     ruleFinding(c, pre, now): the finding the rule stands in for research with (by 'rule', no call,
//               no cost), its verdict research.mjs verdictOf reads (rule.act), its words naming the pattern and
//               its record
//   replay      replayPatterns(checks, from, to): the researched CHECKs between the two times, each judged on the
//               book as it stood when it was researched (no look-ahead: research made and graded before it), how
//               many the rule would have resolved, the calls and dollars saved, its agreement with what the research
//               found, and the hit record of the ones it resolved

import { tallyOf, wilson } from './check-learn.mjs';
import { ADJUST_STATUS, causeKey, hollow, verdictOf } from './research.mjs';

export const PATTERN_V = 1;
export const VAC_SEEN = 0.05;
export const SHARE_FLOOR = 0.5;
export const SHARE_FULL = 0.85;
export const SUPPORT_K = 20;
export const SUPPORT_SPAN = 0.03;
export const EVIDENCE_G = 10;
export const MAX_RATE = 0.9;
export const KEEP_SLACK = 0.1;
export const RESOLVABLE = ['bet', 'held', 'pass'];
// (the role reasons read off the injury report: something missing around him is seen by the feeds)
const SEEN_ROLES = new Set(['qb1-out', 'backup-qb', 'group-out', 'part-time']);

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const nameKey = (s) => String(s ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

// Whether the feeds showed something missing around him (see above)
export function seenOf(c) {
  const sub = c?.diagnosis?.cause === 'role' ? c.diagnosis.sub : c?.cause === 'role' ? c.roleReason : null;
  if (sub && SEEN_ROLES.has(sub)) return true;
  const p = c?.projection ?? {};
  return (Array.isArray(p.out) && p.out.length > 0) || (fin(p.vac) && p.vac >= VAC_SEEN);
}

// A CHECK's pattern (see above): its research's kept one, else made now
export function patternKey(c) {
  return c?.research?.pattern ?? c?.seed?.pattern ?? `${causeKey(c)}|${seenOf(c) ? 'seen' : 'unseen'}`;
}

// (a finding's resolution from the finding alone: a seeded label's, or a live one's without the run's words)
export function resolutionOfFinding(rs, c = null) {
  if (!rs || typeof rs !== 'object' || rs.problem || hollow(rs)) return null;
  const v = verdictOf(rs);
  if (v === 'bet') return 'bet';
  if (v !== 'adjust') return 'check';
  if (rs.feeds?.inOurFeeds && rs.feeds.feed === 'injury report') return 'held';
  const who = nameKey(rs.player);
  const out = (c?.projection?.out ?? []).map((x) => nameKey(typeof x === 'string' ? x : x?.name));
  if (who && out.includes(who)) return 'held';
  // (the role guard's own reason naming him: "his team's starting quarterback (Lamar Jackson) out")
  if (who && ADJUST_STATUS.has(rs.status) && nameKey(c?.reason).includes(who)) return 'held';
  if (ADJUST_STATUS.has(rs.status)) return 'input';
  if (/\bstart(s|ing|er)?\b|\bQB1\b/i.test(rs.summary ?? '') && ['lineup', 'role'].includes(rs.category)) return 'input';
  return 'pass';
}

// A researched CHECK's resolution (see above): null where there's no research of its own (none, a rule's, hollow)
export function resolutionOf(c) {
  const rs = c?.research;
  if (rs && rs.by !== 'rule' && !rs.problem && !hollow(rs)) {
    const v = verdictOf(rs);
    if (v !== 'adjust') return v === 'bet' ? 'bet' : 'check';
    const input = String(rs.moved?.input ?? '');
    const why = `${rs.call?.why ?? ''} ${rs.moved?.now ?? ''}`;
    if (/on the report already|say so already/.test(input)) return 'held';
    if (/^none: a reason no input/.test(input) || /no input of the model's can carry it/.test(why)) return 'pass';
    if (input && !/^(none|finding)/.test(input)) return 'input';
    return resolutionOfFinding(rs, c);
  }
  if (c?.seed && !c.seed.problem) return resolutionOfFinding(c.seed, c);
  return null;
}

// (when its research was made: the live one's, a seeded one's)
const researchedAt = (c) => Date.parse((c?.research?.by !== 'rule' ? c?.research?.at : null) ?? c?.seed?.at ?? '');

// The patterns' book (see above): Map key -> { key, n, counts, top, k, low, share, record, m, support,
// evidence, rate }. before: only research made and results graded before it (ms; the replay's no look-ahead)
export function patternBook(checks = [], { before = Infinity } = {}) {
  const groups = new Map();
  const of = (k) => {
    if (!groups.has(k)) groups.set(k, { key: k, researched: [], graded: [] });
    return groups.get(k);
  };
  for (const c of checks ?? []) {
    if (!c || c.closedAt === undefined ? false : false) continue;
    const key = patternKey(c);
    const res = resolutionOf(c);
    const at = researchedAt(c);
    if (res && at < before) of(key).researched.push({ c, res });
    const rule = c?.research?.by === 'rule' ? c.research.rule?.act : null;
    const done = c?.checkResult && !c.checkResult.void && Date.parse(c.checkResult.gradedAt ?? '') < before;
    if (done && (res || rule) && (rule ? Date.parse(c.research.at ?? '') < before : at < before)) of(key).graded.push({ c, res: rule ?? res });
  }
  const book = new Map();
  for (const g of groups.values()) {
    const counts = {};
    for (const { res } of g.researched) counts[res] = (counts[res] ?? 0) + 1;
    const n = g.researched.length;
    const top = RESOLVABLE.filter((r) => counts[r]).sort((a, b) => counts[b] - counts[a])[0] ?? null;
    const k = top ? counts[top] : 0;
    const low = n ? wilson(k, n)[0] : 0;
    const share = clamp01((low - SHARE_FLOOR) / (SHARE_FULL - SHARE_FLOOR));
    const t = tallyOf(g.graded.filter((x) => x.res === top).map((x) => x.c));
    const be = t.breakEven ?? 0.524;
    const hs = t.decided ? (t.hitRate * t.decided + SUPPORT_K * be) / (t.decided + SUPPORT_K) : be;
    const m = hs - be;
    const support = !top ? 0 : clamp01(0.5 + ((top === 'pass' ? -m : m) / (2 * SUPPORT_SPAN)));
    const evidence = t.decided / (t.decided + EVIDENCE_G);
    const rate = r3(MAX_RATE * share * support * evidence);
    book.set(g.key, { key: g.key, n, counts, top, k, low: r3(low), share: r3(share), record: { won: t.won, lost: t.lost, push: t.push, decided: t.decided, hitRate: t.hitRate, breakEven: t.breakEven, profit: t.profit }, m: r3(m), support: r3(support), evidence: r3(evidence), rate });
  }
  return book;
}

// (a CHECK's own draw, 0 to 1: its id hashed (FNV-1a, then murmur3's finalizer so near ids spread evenly), the same
// every run)
export function unitOf(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id ?? '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}

// A CHECK resolved by its pattern's rule (see above): { act, key, rate, u, entry } or null
export function preResolve(c, book) {
  const key = patternKey(c);
  const e = book?.get?.(key);
  if (!e?.top || !(e.rate > 0)) return null;
  const u = unitOf(c?.id);
  const kept = c?.research?.by === 'rule' && c.research.pattern === key;
  if (!(u < e.rate || (kept && u < e.rate + KEEP_SLACK))) return null;
  return { act: e.top, key, rate: e.rate, u: r3(u), entry: e };
}

const WORDS = {
  bet: "the research found nothing explaining the gap: the model's side priced at the trust",
  held: "the research found the reason in the model's inputs already (the injury report): priced at the trust as it stands",
  pass: "the research found a real reason no input of the model's carries: passed",
};

// The finding the rule stands in for research with (see above)
export function ruleFinding(c, pre, now = new Date()) {
  const e = pre.entry;
  const rec = `${e.record.won}-${e.record.lost}${e.record.push ? `-${e.record.push}` : ''}${e.record.hitRate === null ? '' : ` (${Math.round(e.record.hitRate * 100)}%, break-even ${Math.round((e.record.breakEven ?? 0) * 100)}%)`}`;
  const summary = pre.loosen ? `Resolved by check-learn's loosening of ${pre.key.slice(7)}, no research call: its graded CHECKs pay on the model's side, so it's priced at the trust (rate ${Math.round(pre.rate * 100)}%).` : `Resolved by its pattern, no research call: ${e.k} of ${e.n} like it (${pre.key}), ${WORDS[pre.act]}; graded ${rec}; rule rate ${Math.round(pre.rate * 100)}%.`;
  return {
    at: now.toISOString(),
    by: 'rule',
    pattern: pre.key,
    rule: { v: PATTERN_V, act: pre.act, ...(pre.loosen ? { loosen: true } : {}), rate: pre.rate, u: pre.u, n: e.n, k: e.k, record: e.record },
    player: null,
    status: 'unknown',
    reason: pre.act === 'bet' ? 'none' : pre.act === 'pass' ? 'role' : 'injury',
    summary: summary.slice(0, 400),
    sources: [],
    explains: pre.act !== 'bet',
    category: pre.act === 'bet' ? 'market' : pre.act === 'pass' ? 'role' : 'injury',
    confidence: 'medium',
    cost: 0,
  };
}

// The replay (see above): the researched CHECKs whose research was made in [from, to)
export function replayPatterns(checks = [], from, to = Infinity) {
  const list = (checks ?? []).filter((c) => c?.research && c.research.by !== 'rule' && resolutionOf(c) && researchedAt(c) >= from && researchedAt(c) < to).sort((a, b) => researchedAt(a) - researchedAt(b));
  const rows = [];
  for (const c of list) {
    const book = patternBook(checks, { before: researchedAt(c) });
    const pre = preResolve({ ...c, research: undefined, seed: undefined, pattern: undefined }, book);
    rows.push({ id: c.id, pick: c.pick ?? null, key: patternKey(c), actual: resolutionOf(c), rule: pre?.act ?? null, rate: pre?.rate ?? book.get(patternKey(c))?.rate ?? 0, cost: c.research.cost ?? 0, result: c.checkResult && !c.checkResult.void ? c.checkResult.status : null, profit: c.checkResult?.profit ?? null });
  }
  const pre = rows.filter((r) => r.rule);
  const graded = pre.filter((r) => r.result);
  return {
    researched: rows.length,
    preResolved: pre.length,
    callsSaved: pre.length,
    dollarsSaved: Math.round(pre.reduce((t, r) => t + r.cost, 0) * 100) / 100,
    researchCost: Math.round(rows.reduce((t, r) => t + r.cost, 0) * 100) / 100,
    agreed: pre.filter((r) => r.rule === r.actual).length,
    record: { won: graded.filter((r) => r.result === 'won').length, lost: graded.filter((r) => r.result === 'lost').length, push: graded.filter((r) => r.result === 'push').length, units: Math.round(graded.reduce((t, r) => t + (r.profit ?? 0), 0) * 100) / 100 },
    rows,
  };
}
