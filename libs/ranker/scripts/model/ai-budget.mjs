// The desk's spend on Claude, capped and logged (the CHECKs' research, research.mjs; the AI write-ups, writeups.mjs, share it):
// every call's real usage and cost kept in one log for every sport, so the caps hold across the hourly runs.
//
//   caps     DAY_CAP ($1.50 a UTC day) and MONTH_CAP ($25 a UTC month), every use together. A call goes only
//            when its estimate (the most it can cost: its max output, a generous input and its searches)
//            fits under both what's left today and this month; its real cost, from the usage the API
//            reports (costOf: Opus 5.5's $4 in, $20 out a million tokens, cache writes $5, reads $0.20, each
//            web search $0.01), is what's logged
//   log      { entries: [{ at, what, sport, id, model, usage, cost, finding?, retry?, failed? }] } (a research
//            call's finding kept with it, research.mjs), the last KEEP_DAYS' kept (the month's
//            total needs them), in .cache/model (the workflow's cache, as the Odds API's usage is); a log there
//            but unreadable spends nothing (fail safe: a cap that can't be counted is a cap reached), warned of
//   floor    the day's and the month's totals also committed with the desk's data (FLOOR_FILE: { day, dayUsd,
//            month, monthUsd, at }), since the log lives in the Actions cache, which a cold or failed restore
//            loses: what the totals hold over the log's own sums is carried into the log as a 'carried' entry
//            when it's read, so a lost cache never resets the caps. An unreadable totals file spends nothing,
//            as an unreadable log. The real backstop is a spend limit on the Anthropic Console's workspace
//   dry      a budget made with dry (run.mjs --dry) never writes its log or its totals

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DAY_CAP = 1.5;
export const MONTH_CAP = 25;
const KEEP_DAYS = 40;
// ($ a million tokens, and a web search's, by model: the claude-api skill's table, cached 2026-10-06, to verify
// on the pricing page before quoting. The older Opus ones are what the API's refusal fallback may serve a call
// on, and a call is priced by the model that served it)
export const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};
export const SEARCH_PRICE = 0.01;
// (where the workflow installs the Anthropic SDK on its own (npm install --prefix .cache/sdk), apart from the
// repo's tree, so installing it doesn't reify the whole monorepo)
export const SDK_DIR = path.resolve(import.meta.dirname, '../../../../.cache/sdk');

// The Anthropic SDK's module: the repo's own if it has one, else the one in SDK_DIR (throws when neither)
export async function loadSdk() {
  try {
    return await import('@anthropic-ai/sdk');
  } catch (err) {
    if (!existsSync(SDK_DIR)) throw err;
    const entry = createRequire(path.join(SDK_DIR, 'package.json')).resolve('@anthropic-ai/sdk');
    return await import(pathToFileURL(entry).href);
  }
}

// (the totals committed with the data: the desk's commit step adds apps/*/scripts/model)
export const FLOOR_FILE = path.resolve(import.meta.dirname, '../../../../apps/nfl/scripts/model/ai-spend.json');

// (a call's real cost from the usage the API reports; a model not priced here at Opus 5.5's)
export function costOf(usage, model = 'claude-opus-5-5') {
  if (!usage || typeof usage !== 'object') return 0;
  const p = PRICES[model] ?? PRICES['claude-opus-5-5'];
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const tokens = n(usage.input_tokens) * p.input + n(usage.output_tokens) * p.output + n(usage.cache_creation_input_tokens) * p.cacheWrite + n(usage.cache_read_input_tokens) * p.cacheRead;
  return tokens / 1e6 + n(usage.server_tool_use?.web_search_requests) * SEARCH_PRICE;
}

// (two usages added: a call continued after a pause is billed for each turn)
export function addUsage(a = {}, b = {}) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return {
    input_tokens: n(a.input_tokens) + n(b.input_tokens),
    output_tokens: n(a.output_tokens) + n(b.output_tokens),
    cache_creation_input_tokens: n(a.cache_creation_input_tokens) + n(b.cache_creation_input_tokens),
    cache_read_input_tokens: n(a.cache_read_input_tokens) + n(b.cache_read_input_tokens),
    server_tool_use: { web_search_requests: n(a.server_tool_use?.web_search_requests) + n(b.server_tool_use?.web_search_requests) },
  };
}

// The budget: { spent: { day, month }, left(), canSpend(estimate), record(entry), list(), save() }. file: the log;
// now: the run's clock; caps: { day, month } (the tests'); dry: never written
export function aiBudget({ file, floor = null, now = new Date(), caps = { day: DAY_CAP, month: MONTH_CAP }, dry = false, log = console } = {}) {
  let entries = [];
  let broken = false;
  try {
    if (file && existsSync(file)) {
      const kept = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(kept?.entries)) throw new Error('no list of entries');
      entries = kept.entries.filter((e) => e && typeof e.at === 'string' && Number.isFinite(e.cost));
    }
  } catch (err) {
    broken = true;
    log.warn?.(`::warning::the AI usage log ${path.basename(file ?? '')} unreadable (${String(err?.message ?? err).slice(0, 100)}): no Claude calls till it's mended`);
  }
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  let dirty = false;
  const spent = () => ({
    day: entries.filter((e) => e.at.slice(0, 10) === day).reduce((t, e) => t + e.cost, 0),
    month: entries.filter((e) => e.at.slice(0, 7) === month).reduce((t, e) => t + e.cost, 0),
  });
  // (the committed totals: what they hold over the log's sums carried into it, today's at now, the rest of the
  // month's at its first moment (today the 1st: all of it today's))
  let floorWas = null;
  try {
    if (!broken && floor && existsSync(floor)) {
      const t = JSON.parse(readFileSync(floor, 'utf8'));
      if (typeof t?.day !== 'string' || typeof t?.month !== 'string' || !Number.isFinite(t?.dayUsd) || !Number.isFinite(t?.monthUsd)) throw new Error('no totals');
      floorWas = t;
      const s0 = spent();
      const dayMore = t.day === day ? Math.max(0, t.dayUsd - s0.day) : 0;
      const monthMore = t.month === month ? Math.max(0, t.monthUsd - s0.month - dayMore) : 0;
      if (dayMore > 1e-6) entries.push({ at: now.toISOString(), what: 'carried', cost: Math.round(dayMore * 1e5) / 1e5 });
      if (monthMore > 1e-6) entries.push({ at: day.endsWith('-01') ? now.toISOString() : `${month}-01T00:00:00.000Z`, what: 'carried', cost: Math.round(monthMore * 1e5) / 1e5 });
      if (dayMore > 1e-6 || monthMore > 1e-6) {
        dirty = true;
        log.log?.(`the AI usage log behind the committed totals: $${(dayMore + monthMore).toFixed(2)} carried into it`);
      }
    }
  } catch (err) {
    broken = true;
    log.warn?.(`::warning::the AI spend totals ${path.basename(floor ?? '')} unreadable (${String(err?.message ?? err).slice(0, 100)}): no Claude calls till they're mended`);
  }
  const left = () => {
    if (broken) return 0;
    const s = spent();
    return Math.max(0, Math.min(caps.day - s.day, caps.month - s.month));
  };
  return {
    get broken() {
      return broken;
    },
    spent,
    left,
    canSpend: (estimate) => !broken && Number.isFinite(estimate) && estimate <= left(),
    // (the entries logged, a copy; an unreadable log's none)
    list: () => (broken ? [] : entries.map((e) => ({ ...e }))),
    record(entry) {
      const e = { at: now.toISOString(), ...entry, cost: Math.round((entry.cost ?? 0) * 1e5) / 1e5 };
      entries.push(e);
      dirty = true;
      return e;
    },
    save() {
      if (!dirty || dry || broken || !file) return false;
      const from = new Date(now.getTime() - KEEP_DAYS * 864e5).toISOString();
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify({ entries: entries.filter((e) => e.at >= from) }, null, 1)}\n`);
      dirty = false;
      // (the totals beside it, written only when they changed)
      if (floor) {
        const s1 = spent();
        const t = { day, dayUsd: Math.round(s1.day * 1e5) / 1e5, month, monthUsd: Math.round(s1.month * 1e5) / 1e5 };
        if (!floorWas || floorWas.day !== t.day || floorWas.month !== t.month || floorWas.dayUsd !== t.dayUsd || floorWas.monthUsd !== t.monthUsd) {
          floorWas = { ...t, at: now.toISOString() };
          mkdirSync(path.dirname(floor), { recursive: true });
          writeFileSync(floor, `${JSON.stringify(floorWas, null, 1)}
`);
        }
      }
      return true;
    },
  };
}
