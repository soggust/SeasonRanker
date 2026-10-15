// The desk's spend on Claude, capped and logged: every call's real usage and cost kept in a log for every sport, so
// the caps hold across the hourly runs. Three budgets, each its own log, totals and caps, none counting the
// others' spend: the AI write-ups' (writeups.mjs: DAY_CAP, MONTH_CAP below), the CHECKs' research's
// (research.mjs: researchBudget, RESEARCH_CAPS) and the news signals' (news-signals.mjs: newsBudget, NEWS_CAPS).
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
//   measured every call with a reported usage (not a failure, not carried) counted for good in the totals file
//            (life: { calls, usd, max }), so the real per-call cost is known however long ago the calls were
//            (the log keeps KEEP_DAYS): the research's trial (research.mjs) ends on it
//   own caps researchBudget and newsBudget: their caps from the repository variables (capsFrom: CHECK_RESEARCH_
//            DAILY_USD / _MONTHLY_USD, NEWS_SIGNALS_DAILY_USD / _MONTHLY_USD), each held to its ceiling, so a
//            typo can't open the spend; unset or unreadable, the defaults

import { existsSync, readFileSync } from 'node:fs';
import { writeAtomic } from './sources.mjs';
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
  // (the news signals' model: prompts up to 100K tokens; cache writes and reads at the usual 1.25x and 0.1x)
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
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

// The CHECKs' research's own budget and the news signals': their logs in the workflow's cache, their totals
// committed beside the write-ups' (the floor, as above), their caps by default and the most a variable may set
const CACHE_DIR = path.resolve(import.meta.dirname, '../../../../.cache/model');
const SPEND_DIR = path.resolve(import.meta.dirname, '../../../../apps/nfl/scripts/model');
export const RESEARCH_USAGE = path.join(CACHE_DIR, 'ai-usage-research.json');
export const RESEARCH_FLOOR = path.join(SPEND_DIR, 'ai-spend-research.json');
export const RESEARCH_CAPS = { day: 0.5, month: 12 };
export const RESEARCH_CEILING = { day: 1, month: 20 };
export const NEWS_USAGE = path.join(CACHE_DIR, 'ai-usage-news.json');
export const NEWS_FLOOR = path.join(SPEND_DIR, 'ai-spend-news.json');
export const NEWS_CAPS = { day: 0.15, month: 4 };
export const NEWS_CEILING = { day: 0.3, month: 6 };

// (a budget's caps from the environment: <prefix>_DAILY_USD and <prefix>_MONTHLY_USD, each a number from 0 to its
// ceiling; unset, empty or not a number, the default)
export function capsFrom(env, prefix, caps, ceiling) {
  const one = (v, d, top) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.min(top, n)) : d;
  };
  return { day: one(env?.[`${prefix}_DAILY_USD`], caps.day, ceiling.day), month: one(env?.[`${prefix}_MONTHLY_USD`], caps.month, ceiling.month) };
}

// The CHECKs' research's budget (research.mjs): its own log and totals, $0.50 a day and $12 a month unless the
// variables say otherwise ($1 and $20 at most)
export const researchBudget = ({ env = process.env, file = RESEARCH_USAGE, floor = RESEARCH_FLOOR, ...rest } = {}) => aiBudget({ ...rest, file, floor, caps: capsFrom(env, 'CHECK_RESEARCH', RESEARCH_CAPS, RESEARCH_CEILING) });

// The news signals' budget (news-signals.mjs): its own log and totals, $0.15 a day and $4 a month unless the
// variables say otherwise ($0.30 and $6 at most)
export const newsBudget = ({ env = process.env, file = NEWS_USAGE, floor = NEWS_FLOOR, ...rest } = {}) => aiBudget({ ...rest, file, floor, caps: capsFrom(env, 'NEWS_SIGNALS', NEWS_CAPS, NEWS_CEILING) });

// (an entry that measures a call: its usage reported, not a failure, not a carried total)
const measures = (e) => !!e && e.what !== 'carried' && !e.failed && !!e.usage && typeof e.usage === 'object' && Number.isFinite(e.cost);

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
  // (the calls measured for good: the totals file's, else the log's own; and this run's on top)
  let lifeBase = null;
  const lifeAdd = { calls: 0, usd: 0, max: 0 };
  try {
    if (!broken && floor && existsSync(floor)) {
      const t = JSON.parse(readFileSync(floor, 'utf8'));
      if (typeof t?.day !== 'string' || typeof t?.month !== 'string' || !Number.isFinite(t?.dayUsd) || !Number.isFinite(t?.monthUsd)) throw new Error('no totals');
      floorWas = t;
      const l = t.life;
      if (l && Number.isFinite(l.calls) && Number.isFinite(l.usd) && Number.isFinite(l.max)) lifeBase = { calls: l.calls, usd: l.usd, max: l.max };
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
  if (!lifeBase) {
    const m = entries.filter(measures);
    lifeBase = { calls: m.length, usd: m.reduce((t, e) => t + e.cost, 0), max: m.reduce((t, e) => Math.max(t, e.cost), 0) };
  }
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  // (every call measured so far: how many, their dollars, the mean and the highest)
  const life = () => {
    const calls = lifeBase.calls + lifeAdd.calls;
    const usd = lifeBase.usd + lifeAdd.usd;
    return { calls, usd: r5(usd), mean: calls ? r5(usd / calls) : null, max: r5(Math.max(lifeBase.max, lifeAdd.max)) };
  };
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
    life,
    caps: { ...caps },
    canSpend: (estimate) => !broken && Number.isFinite(estimate) && estimate <= left(),
    // (the entries logged, a copy; an unreadable log's none)
    list: () => (broken ? [] : entries.map((e) => ({ ...e }))),
    record(entry) {
      const e = { at: now.toISOString(), ...entry, cost: Math.round((entry.cost ?? 0) * 1e5) / 1e5 };
      entries.push(e);
      if (measures(e)) {
        lifeAdd.calls++;
        lifeAdd.usd += e.cost;
        lifeAdd.max = Math.max(lifeAdd.max, e.cost);
      }
      dirty = true;
      return e;
    },
    save() {
      if (!dirty || dry || broken || !file) return false;
      const from = new Date(now.getTime() - KEEP_DAYS * 864e5).toISOString();
      writeAtomic(file, `${JSON.stringify({ entries: entries.filter((e) => e.at >= from) }, null, 1)}\n`);
      dirty = false;
      // (the totals beside it, written only when they changed)
      if (floor) {
        const s1 = spent();
        const lf = life();
        const t = { day, dayUsd: Math.round(s1.day * 1e5) / 1e5, month, monthUsd: Math.round(s1.month * 1e5) / 1e5, life: { calls: lf.calls, usd: lf.usd, mean: lf.mean, max: lf.max } };
        if (!floorWas || floorWas.day !== t.day || floorWas.month !== t.month || floorWas.dayUsd !== t.dayUsd || floorWas.monthUsd !== t.monthUsd || floorWas.life?.calls !== t.life.calls || floorWas.life?.usd !== t.life.usd) {
          floorWas = { ...t, at: now.toISOString() };
          writeAtomic(floor, `${JSON.stringify(floorWas, null, 1)}
`);
        }
      }
      return true;
    },
  };
}
