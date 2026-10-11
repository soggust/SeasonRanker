// Claude's analysis for the strong picks (LOCK and LOVE): each one's reason, its risk line (the Bets page's
// Devil's Advocate) and a headline, written by claude-opus-5-5 from the bet's own fact sheet (writeup.mjs
// factsOf: everything the model knew when it placed it, worked into plain numbers) and checked by the same
// grounding rules the plain text passes (writeup.mjs validate). Off the bettor's path: run after it, and
// nothing it does can stop the picks (a failure, a cap, a rejection: the plain text stays).
//
//   which    the picks in picks.json's top 40 at a level in WRITEUP_LEVELS (lock,high: picks.mjs levelOf, the
//            bet's own band, never the page's), the edge bets on their unguarded games, starting more than
//            20 minutes from now, that today's guards would still place (guardedNow: not past the gap, not an
//            assumed -110 the unpriced guard would skip, not a side against its own projection; an open bet placed
//            before a guard was added isn't argued for), with no analysis for the bet's current facts (its hash, writeup.mjs hashOf)
//            that's ok, rejected or refused, and fewer than 3 calls on those facts. WRITEUP_TOP_N (0) adds the
//            top N a sport by score whatever their band (the owner's). Lock before high, then the soonest
//            start, then the best score
//   frozen   once a bet's facts' analysis is ok it's never asked again: a re-price (a new hash) is the only
//            thing that writes it again; a PROMPT_V bump rewrites nothing on its own (--rewrite does)
//   request  claude-opus-5-5 at WRITEUP_EFFORT (high; xhigh, max, medium or low), max_tokens 8,000 (12,000 at
//            xhigh or max: the thinking counts against it), the system prompt frozen and cached (no
//            timestamps: the run's first call writes the cache alone, the rest read it, 3 at a time), the
//            answer a JSON schema (output_config.format), the API's refusal fallback (WRITEUP_FALLBACKS=off
//            drops it), no SDK retries (a retried call that timed out may have been billed each time): one
//            CALL_TIMEOUT_MS (4 minutes) at most, and no call started RUN_DEADLINE_MS (5 minutes) after the
//            run's first, so the step's 10 minutes hold
//   checked  checkAnswer: every numeral listed with the sheet path it came from and a value there, its
//            names the sheet's, no injury, weather or rest talk the sheet doesn't hold, none of the banned
//            words, the side and the line said together (validate); one that fails is asked once more, fresh,
//            with what failed, and failing again is rejected (the plain text stays). Lengths, cites and a
//            driver's direction are only logged. A refusal is refused; a call cut short (max_tokens) a failed
//            try, asked again next run (3 calls on its facts at most); a bad request rejected; a rate limit,
//            a server or connection error left for the next run, and 3 in a row stop the sport
//   capped   ai-budget.mjs's caps, with the CHECKs' research ($1.50 a UTC day, $25 a month, every sport;
//            WRITEUP_DAILY_USD and WRITEUP_MONTHLY_USD may only lower them): a call starts only when the
//            logged real spend, the worst case of the calls in flight and its own worst case (WORST: its
//            max_tokens of output and 6,000 tokens of input, at the priciest model a fallback could serve)
//            all fit; at most WRITEUP_MAX_PER_RUN (12) calls a run. One over the caps is marked skipped-budget
//            and asked the next run
//   logged   every call in the AI usage log (.cache/model/ai-usage.json: { what: 'writeup', sport, id, hash,
//            model (the one that served it), effort, attempt, usage, cost, status, problems, stance, chars }),
//            its cost from the usage the API reports (ai-budget.mjs costOf: the skill's price table, to verify
//            on the pricing page); a call that failed with none reported at its worst case where it may have
//            been billed unseen (a timeout, a dropped connection, a server's error), at nothing where the API
//            turned it away; the run's line: written, retried, rejected, its dollars and tokens, the
//            day's and the month's spend against the caps
//   written  writeups.json items[id].ai = { hash, v, at, model, effort, status, headline, reason, risk, stance,
//            numbers, cites, attempts, sheet (the state-derived facts frozen with it, for audit) }; picks.json
//            patched in place with applyWriteups (picks.mjs uses the same on every hourly render, so the text
//            never flips back to plain). writeups.json saved after each bet's done, so a step killed mid-sport
//            keeps the analyses it paid for
//
// Run: node libs/ranker/scripts/model/writeups.mjs [sport ...] [--dry | --count | --probe | --validate] [--rewrite]
//   (none)      the analyses due, under the caps (only with ANTHROPIC_API_KEY, and WRITEUPS not off)
//   --dry       builds every request and calls nothing: the queue, each sheet's size and its projected cost at
//               medium, high and xhigh
//   --count     the queue's real input tokens (messages.countTokens: free, needs the key)
//   --probe     one live call on the first queued pick, nothing written: checks the fallbacks and the output
//               format are accepted together
//   --validate  the owner's measured run before enabling: 12 recent LOVE/LOCK-level bets across the sports
//               (6 props, 6 game lines; the best of the rest where there aren't so many) written at high and at
//               xhigh, nothing written to the picks, the report in .cache/writeups-validate.md (both texts side
//               by side, the measured tokens and dollars), capped at $4 (VALIDATE_CAP) and logged as
//               'writeup-validate' (it counts toward the month, and the day it runs)
//   --rewrite   the analyses written under an older PROMPT_V written again (never automatic)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiBudget, costOf, DAY_CAP, FLOOR_FILE, loadSdk, MONTH_CAP, PRICES } from './ai-budget.mjs';
import { gapGuard, intentOf } from './desk.mjs';
import { skewOnly, unpricedWhy } from './props.mjs';
import { levelOf, scoreParts } from './picks.mjs';
import { applyWriteups, factsOf, plainFor, sibOf, stableStringify, validate } from './writeup.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const MODEL = 'claude-opus-5-5';
// (the prompt's version: a bump rewrites nothing on its own; --rewrite does)
export const PROMPT_V = 1;
export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// (a pick this close to its start isn't written: its text would show for minutes)
export const LEAD_MS = 20 * 60e3;
// (the calls on one bet's facts at most, its retry included)
export const MAX_ATTEMPTS = 3;
// (the most a request's input can be: the system prompt, the sheet and a retry's problems)
export const WORST_INPUT = 6000;
// (the measured run's cap, every call together)
export const VALIDATE_CAP = 4;
// (a call's most, and when the run stops starting calls: the workflow step's 10 minutes. No SDK retries)
export const CALL_TIMEOUT_MS = 240_000;
export const RUN_DEADLINE_MS = 300_000;
// (the statuses that are final for a bet's facts: never asked again on the same hash)
const FINAL = new Set(['ok', 'rejected', 'refused']);
// (the band's word on the sheet)
const BAND = { lock: 'LOCK', high: 'LOVE', medium: 'LIKE', low: 'PASS' };
// (the planned output tokens by effort, thinking included, for --dry's projection: the spec's, to replace with
// the measured run's)
const PLAN_OUT = { low: 900, medium: 1350, high: 2550, xhigh: 5050, max: 8000 };

// ---------------------------------------------------------------------------------------------------------
// The prompt, the request, the answer

// (frozen: no timestamps, nothing per run, so it caches; a change here is a PROMPT_V bump)
export const SYSTEM = `You write the analysis for one bet on SeasonRanker's Bets page. The site's betting model (the Algorithm) prices NFL, NBA, NHL and MLB game lines and player props against DraftKings, and it rated this bet LOVE or LOCK, its top two bands. Readers are sports fans who bet. They see your paragraph under the pick and your risk line under it, labelled "Devil's Advocate".

You get one FACT SHEET in JSON: everything the model knew when it placed the bet, already worked into plain numbers. The sheet is the whole world for this task. Your own knowledge of these players, teams, injuries, form, history and news is out of date and not allowed, even when you are sure of it.

YOUR JOB
Make the strongest case the facts honestly support, say what the price may be missing, and say plainly how the bet loses. Write like a sharp friend who bets for a living: thesis first, the two or three facts that carry it, the price, the hole. No hype and no boilerplate hedging.

HOW TO READ THE SHEET
- bet: the pick as placed. band is the model's rating. hoursBeforeStart is how early it was bet.
- price.breakEvenPct: the chance the bet needs at its odds to break even. price.bookFairPct: the market's chance with the bookmaker's cut removed (bookFairFrom says whose price). price.modelPct: the model's raw chance. price.betPct: the chance the desk actually bets with, the market's chance moved leanSharePct of the way toward the model's. price.edgePts is betPct minus breakEvenPct: the real edge. price.gapPts is how far the model sits from the market; pastGapLimit true means that gap is wider than gapLimitPts, the most the desk now allows, and a gap that size is more often missing news than an edge, so your risk must say so. price.untested true means this market or prop type has too few graded bets, so the desk leans only halfway. price.edgeFrom says whether the edge comes from the projection, from the book's own price, or both. price.winsToRepayLoss is how many wins at these odds repay one loss.
- projection (props): mean is the projection for this game; lineDiff is mean minus the line. blendedRate is his per-game rate, this season blended with last season by the fit, not a raw season average. recent is his average over his last recentN games, and recentWeightPct is how much the fit counts it (0 means not at all). history.sideSharePct is the share of his weighted past games that landed on this bet's side of this line.
- drivers: each step that moved his blended rate to the projection, with appliedPct, the effect it actually had here. Only drivers and game.keptTerms moved the number. A driver's raw value can be larger than its effect because the fit counts it only partly; always use appliedPct.
- notWeighed: factors measured for this bet that the fit gives no weight. They did not move the projection. Name one only as something the model leaves out, which is often the honest risk, never as a reason the number is what it is.
- lineBeforeBet: the prop line when it opened and when the bet was placed; againstBet true means it moved against this side before the bet.
- game: the model's expected score, the net effect of the game's context (contextNetMargin, contextNetTotal; small means the situation barely matters), keptTerms (the only context factors the game model counts, with their sizes), starters, weather, rest, the market's moves since the open before the bet (moveSinceOpen), and any flags or guard (a guard means the game's own lines were held when priced).
- fit (props): how this stat's projection did in back-tests. maeModel against maeOwnAverage: lower is better. calibrationAtThisChance: when the fit gave this side about this chance, how often it happened. allPlayersBias: projection minus result across all players, in the stat's units; positive means it runs high, a tailwind for an under and a warning for an over.
- record: the desk's own graded bets of this type and side, and its published record in this band. Under 30 graded bets it is a hint, not evidence; say so if you use it.
- notOnSheet: what the model could not see. Good risk lines often come from here.

GROUNDING RULES (a program checks every one; a failed check throws your text away)
1. Every numeral you write must be a value on the sheet, as written or rounded to fewer decimals (20.89 may be 20.9 or 21). Percent fields are already percents: write 58.8% or 59%, never 0.588. Compute nothing: no differences, sums, ratios or percents the sheet doesn't give. If you want a comparison the sheet lacks, say it in words ("well under the line").
2. List every numeral you wrote in "numbers", exactly as written, with the sheet path it came from in dots, for example {"text": "20.9", "fact": "projection.mean"} or {"text": "4.5", "fact": "drivers.0.appliedPct"}.
3. Write numbers above three as numerals, never as words, and never write fractions as words ("two thirds", "a quarter").
4. Name only the people on the sheet, and teams only by the abbreviations on the sheet. No cities or nicknames. Start the headline and every sentence with a name or abbreviation from the sheet, or with one of these words: The, This, That, At, If, His, He, With, But, And, Even, On, What, It, Its, A, An, So, Still, Where, When, Both, Against, Only, Over, Under, Across, We, In, There, They, Their, For, To, As, By, From, After, Before, Because, Since, While, Despite, Given, Without, Unless, Also, Yet, However, All, Most, Every, Each.
5. Claims only from the sheet: no injury unless it is in projection.out or projection.questionable; no weather unless game.weather is present; no rest or travel unless game.rest or game.b2b is present; never streaks, momentum, motivation, coaching, rivalries, standings, empty-net goals or other game-state stories, sharp or public money, or line moves beyond lineBeforeBet and game.moveSinceOpen.
6. Never present a factor in notWeighed as counted, and never present a driver that works against the bet as support. A negative appliedPct lowers the projection.
7. Plain text: no markdown, lists, emoji, headings or quotation marks. American odds keep their sign. Don't mention the fact sheet, field names, Kelly, log loss or yourself. Never say lock, guaranteed, can't lose or free money.

WHAT TO WRITE
- headline: at most 12 words, the thesis as a bettor would say it. The only number allowed is the line.
- reason: one paragraph, 3 to 5 sentences, 450 to 900 characters. Don't open by restating the pick; open with the thesis. Then the facts that carry it, strongest first, each tied to what it does to the number. Then what the price may be underweighting, as far as the sheet supports it; if the honest answer is that the model disagrees with a market that likely knows more, say that. Then the price: the market's chance, the chance the desk bets, the break-even. Name the side and the line once, together (for example "under 23.5"; on a spread or a moneyline the team's abbreviation and its line, for example "MIN +1.5").
- risk: 1 or 2 sentences, 100 to 250 characters: the single most likely way this bet loses, specific to this bet. Not "variance" or "anything can happen".
- stance: your honest read, apart from the band. strong: the facts line up and the edge survives the caveats. fair: a real case with a real hole. thin: the band overstates it (past the gap limit, a tiny sample, or the edge resting on a single fact). Write the paragraph to match your stance; never talk a thin case up.
- numbers: every numeral in headline, reason and risk, with its sheet path.
- cites: the 2 to 8 sheet paths your argument leans on.

EXAMPLE OF THE VOICE (from a different bet; its numbers are not yours)
{"headline":"Over 4.5 shots on volume the matchup barely dents","reason":"The case is volume: his blended rate is 6.1 shots a game over 22 games, and the model projects 6.4 for this one, comfortably over 4.5, with 68% of his weighted games on this side of the line. The opponent's defense takes 2.1% off, small next to the gap. The market's no-vig price says 52%; the desk bets 57.3% against a 54.5% break-even, an edge of 2.8 points. What the price may be weighing is the move: the line had already gone from 4 to 4.5 before the bet.","risk":"The line moved against this side before the bet and the edge is under 3 points; a quiet night on the power play leaves him at 4.","stance":"fair","numbers":[{"text":"6.1","fact":"projection.blendedRate"}],"cites":["projection.mean","price.edgePts"]}`;

// (the answer's shape: no nullable enums (a past 400), lengths checked in code)
export const OUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'reason', 'risk', 'stance', 'numbers', 'cites'],
  properties: {
    headline: { type: 'string' },
    reason: { type: 'string' },
    risk: { type: 'string' },
    stance: { type: 'string', enum: ['strong', 'fair', 'thin'] },
    numbers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'fact'], properties: { text: { type: 'string' }, fact: { type: 'string' } } } },
    cites: { type: 'array', items: { type: 'string' } },
  },
};

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, d) => {
  const x = Number.parseFloat(v);
  return Number.isFinite(x) ? x : d;
};

// The run's settings from the environment (see above)
export function configOf(env = process.env) {
  const effort = EFFORTS.includes(env.WRITEUP_EFFORT) ? env.WRITEUP_EFFORT : 'high';
  const big = effort === 'xhigh' || effort === 'max';
  return {
    on: env.WRITEUPS !== 'off',
    effort,
    maxTokens: Math.max(2000, Math.min(32000, Math.round(num(env.WRITEUP_MAX_TOKENS, big ? 12000 : 8000)))),
    levels: String(env.WRITEUP_LEVELS || 'lock,high')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    topN: Math.max(0, Math.min(40, Math.round(num(env.WRITEUP_TOP_N, 0)))),
    maxPerRun: Math.max(0, Math.round(num(env.WRITEUP_MAX_PER_RUN, 12))),
    // (the caps may only be lowered: ai-budget.mjs's are the ceiling)
    caps: { day: Math.min(DAY_CAP, num(env.WRITEUP_DAILY_USD, DAY_CAP)), month: Math.min(MONTH_CAP, num(env.WRITEUP_MONTHLY_USD, MONTH_CAP)) },
    fallbacks: env.WRITEUP_FALLBACKS !== 'off',
    concurrency: 3,
  };
}

// A call's worst case in dollars: its whole max_tokens out and WORST_INPUT in at a cache write's price, at the
// priciest model the table has (a fallback may serve it). A refusal re-run on the fallback is billed on top:
// rare, and logged at its real cost
export function worstCase(maxTokens) {
  const p = Object.values(PRICES);
  const out = Math.max(...p.map((x) => x.output));
  const write = Math.max(...p.map((x) => x.cacheWrite));
  return (maxTokens * out + WORST_INPUT * write) / 1e6;
}

// A bet's fact sheet for the AI (writeup.mjs factsOf, schema v1) with its band, less the plain writer's own
// helpers (its id, the chances' decimals, whether the drivers gave the projection back, the rounded missing)
export function aiSheetOf(bet, { game = null, sib = null, state = null, ledger = null, params = null, picksRecord = null, level = 'high' } = {}) {
  const sheet = factsOf(bet, { game, sib, state, ledger, params, picksRecord });
  delete sheet.bet.id;
  delete sheet.price.decimals;
  delete sheet.driversOk;
  if (sheet.game) delete sheet.game.missingRounded;
  sheet.bet.band = BAND[level] ?? 'LOVE';
  return sheet;
}

// (the user message: the sheet, and a retry's reasons)
export const messageOf = (sheet, problems = null) => `FACT SHEET\n${stableStringify(sheet)}${problems?.length ? `\n\nA previous draft was rejected for: ${problems.join('; ')}. Write it again under the same rules.` : ''}`;

// The request (client.beta.messages.create's): a fresh single turn each time, a retry too (never an edited
// history: a thinking block's history can't be changed)
export function requestOf(sheet, { effort = 'high', maxTokens = 8000, fallbacks = true, problems = null } = {}) {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort, format: { type: 'json_schema', schema: OUT_SCHEMA } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: messageOf(sheet, problems) }],
    ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
}

// (a reply's JSON: its text blocks joined as they come)
export function parseAnswer(msg) {
  const text = (msg?.content ?? [])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    const o = JSON.parse(text);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

// (a sheet path as the validator walks it: brackets to dots, no leading "sheet.")
const pathOf = (s) =>
  String(s ?? '')
    .trim()
    .replace(/^sheet\./, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\./, '');
const at = (sheet, p) =>
  pathOf(p)
    .split('.')
    .reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), sheet);

// An answer against its sheet: { hard, soft }. hard: what throws it away (its shape, then validate's numerals,
// names, topics, banned words, the side and the line said together (in the headline and the reason: the risk
// may say how the other side wins), its format); soft: logged only (lengths, cites, a numeral in the headline
// beyond the line, a driver against the bet worded as a lift)
export function checkAnswer(out, sheet) {
  const hard = [];
  const soft = [];
  if (!out || typeof out !== 'object') return { hard: ['no JSON answer'], soft };
  for (const k of ['headline', 'reason', 'risk']) if (typeof out[k] !== 'string' || !out[k].trim()) hard.push(`no ${k}`);
  if (!['strong', 'fair', 'thin'].includes(out.stance)) hard.push('no stance');
  if (!Array.isArray(out.numbers)) hard.push('no numbers list');
  if (hard.length) return { hard, soft };
  const numbers = out.numbers.filter((n) => n && typeof n.text === 'string').map((n) => ({ text: n.text.trim(), fact: pathOf(n.fact) }));
  const headline = out.headline.trim();
  const reason = out.reason.trim();
  const risk = out.risk.trim();
  if (/\n/.test(`${headline}${reason}${risk}`)) hard.push('a line break inside a field');
  hard.push(...validate([headline, reason, risk].join('\n'), sheet, numbers, { reason: [headline, reason].join('\n') }));
  // (the soft ones)
  if (headline.length > 90) soft.push(`headline ${headline.length} characters`);
  if (reason.length < 400 || reason.length > 950) soft.push(`reason ${reason.length} characters`);
  if (risk.length < 80 || risk.length > 280) soft.push(`risk ${risk.length} characters`);
  const cites = Array.isArray(out.cites) ? out.cites.filter((c) => typeof c === 'string') : [];
  if (cites.length < 2 || cites.length > 8) soft.push(`${cites.length} cites`);
  const lost = cites.filter((c) => at(sheet, c) === undefined);
  if (lost.length) soft.push(`cites not on the sheet: ${lost.slice(0, 3).join(', ')}`);
  const line = sheet.bet?.line;
  const extra = [...headline.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((v) => v > 3 && v !== Math.abs(line ?? NaN));
  if (extra.length) soft.push(`headline numerals beyond the line: ${extra.join(', ')}`);
  const over = sheet.bet?.side === 'over';
  if (/lifts|pushes up|boosts/i.test(reason)) {
    const against = numbers.map((n) => ({ n, v: at(sheet, n.fact) })).filter(({ n, v }) => /^drivers\.\d+\.appliedPct$/.test(n.fact) && fin(v) && (over ? v < 0 : v > 0));
    if (against.length && (over || sheet.bet?.side === 'under')) soft.push(`a driver against the bet cited beside a lift: ${against.map(({ n }) => n.fact).join(', ')}`);
  }
  return { hard, soft };
}

// ---------------------------------------------------------------------------------------------------------
// The queue

// Why an open bet today's guards wouldn't place (null: they would): past the gap (desk.mjs gapGuard), an
// assumed -110 the unpriced guard skips (props.mjs unpricedWhy, at his over-rate when placed), or a prop's side
// against its own projection (props.mjs skewOnly). Bets placed before a guard was added stay open; they're not
// argued for on the page
export function guardedNow(bet) {
  if (!bet) return null;
  const market = bet.market === 'prop' ? 'prop' : bet.market;
  if (gapGuard(market, bet.model, bet.fair)) return 'gap';
  if (bet.market !== 'prop') return null;
  if (bet.oddsAssumed && (bet.line === 0.5 || (fin(bet.projection?.fairOver) && unpricedWhy(bet.line, bet.projection.fairOver)))) return 'unpriced';
  if (skewOnly(bet.side, bet.projection?.mean, bet.line)) return 'skew';
  return null;
}

const levelRank = (l) => (l === 'lock' ? 0 : l === 'high' ? 1 : 2);
const gameOf = (games, id) => (games instanceof Map ? games.get(id) : Array.isArray(games) ? games.find((g) => g?.id === id) : null) ?? null;

// A sport's analyses due (see above): [{ sport, id, pick, bet, level, score, hash, sheet, attempts }], in order.
// writeups: writeups.json, its plain entries brought up to date as picks.mjs does (plainFor); guarded: today's
// guards on an open bet (guardedNow; the tests' fixtures are bets placed before the gap guard)
export function queueOf({ sport, picks, ledger, state = null, games = null, writeups, now = new Date(), cfg = configOf({}), rewrite = false, guarded = guardedNow }) {
  const bets = new Map((ledger?.bets ?? []).filter((b) => b.status === 'open').map((b) => [b.id, b]));
  const rows = (picks?.picks ?? []).filter((p) => p && p.level !== 'check');
  const topIds = new Set(
    cfg.topN
      ? rows
          .slice()
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, cfg.topN)
          .map((p) => p.id)
      : [],
  );
  const items = [];
  for (const p of rows) {
    if (!cfg.levels.includes(p.level) && !topIds.has(p.id)) continue;
    const bet = bets.get(p.id);
    if (!bet || intentOf(bet) !== 'edge' || p.edge === false || bet.context?.guard) continue;
    if (!(Date.parse(bet.start) - now.getTime() > LEAD_MS)) continue;
    if (guarded(bet)) continue;
    const game = gameOf(games, bet.event);
    const sib = sibOf(bet, ledger.bets);
    const { hash, entry } = plainFor(bet, { game, sib, state, ledger, writeups });
    const ai = entry?.ai;
    const same = !!ai && ai.hash === hash;
    const stale = rewrite && same && ai.v !== PROMPT_V;
    if (same && FINAL.has(ai.status) && !stale) continue;
    const attempts = same && !stale ? (ai.attempts ?? 0) : 0;
    if (attempts >= MAX_ATTEMPTS) continue;
    const rec = picks?.record?.byLevel?.[p.level];
    const sheet = aiSheetOf(bet, { game, sib, state, ledger, params: entry?.plain?.params ?? null, picksRecord: rec ? { won: rec.wins ?? 0, lost: rec.losses ?? 0 } : null, level: p.level });
    items.push({ sport, id: p.id, pick: p.pick, bet, level: p.level, score: p.score ?? 0, hash, sheet, attempts });
  }
  return items.sort((a, b) => levelRank(a.level) - levelRank(b.level) || Date.parse(a.bet.start) - Date.parse(b.bet.start) || b.score - a.score);
}

// ---------------------------------------------------------------------------------------------------------
// The calls

// (an error's kind: a bad request is the request's fault (rejected); the rest (a rate limit, a server's, a
// connection's, a timeout) are left for the next run)
const badRequest = (err) => err?.status === 400 || err?.name === 'BadRequestError';
// (an error that may have been billed though no usage came back: a timeout, a dropped connection, a server's.
// A request the API turned away (4xx, but a timeout's 408) was not)
export const maybeBilled = (err) => !(fin(err?.status) && err.status >= 400 && err.status < 500 && err.status !== 408);

// The run's gate: every call through it, one budget, the calls in flight reserved at their worst case, the run's
// limit and its deadline (a clock time). through(worst, fn): fn's result, or { capped: 'caps' | 'run' | 'time' }
// without calling it. A call that fits the
// caps but not beside the ones in flight waits for one of them to finish, then asks again
export function gateOf(budget, { maxPerRun = Infinity, cap = Infinity, deadline = Infinity, clock = Date.now } = {}) {
  let reserved = 0;
  let calls = 0;
  let spent = 0;
  let waiting = [];
  const fits = (worst) => !!budget?.canSpend(reserved + worst) && spent + reserved + worst <= cap;
  return {
    get calls() {
      return calls;
    },
    get reserved() {
      return reserved;
    },
    get spent() {
      return spent;
    },
    add(cost) {
      spent += fin(cost) ? cost : 0;
    },
    async through(worst, fn) {
      for (;;) {
        if (calls >= maxPerRun) return { capped: 'run' };
        if (clock() >= deadline) return { capped: 'time' };
        if (fits(worst)) break;
        if (reserved <= 0) return { capped: 'caps' };
        await new Promise((resolve) => waiting.push(resolve));
      }
      calls++;
      reserved += worst;
      try {
        return await fn();
      } finally {
        reserved -= worst;
        const wake = waiting;
        waiting = [];
        for (const w of wake) w();
      }
    },
  };
}

// One bet written: { status, out?, problems, soft, calls: [{ attempt, model, usage, cost, status }], attempts,
// model, transient? }. A hard failure asked once more, fresh, with its problems; what: the log's tag
export async function writeOne(client, item, { budget, gate, cfg, what = 'writeup', effort = cfg.effort, maxTokens = cfg.maxTokens, log = console } = {}) {
  const worst = worstCase(maxTokens);
  const calls = [];
  let attempts = item.attempts ?? 0;
  let problems = null;
  let model = MODEL;
  // (a call's reply accounted for (logged, its cost on the gate) before its reservation is let go, so a call
  // waiting on it sees the spend)
  const account = (res) => {
    attempts++;
    const entry = { what, sport: item.sport, id: item.id, hash: item.hash, effort, attempt: attempts };
    if (res.err) {
      const err = res.err;
      const text = String(err?.message ?? err).slice(0, 200);
      // (none reported: its worst case where it may have been billed unseen, so the caps count it)
      const cost = err?.usage ? costOf(err.usage, MODEL) : maybeBilled(err) ? worst : 0;
      gate.add(cost);
      budget?.record({ ...entry, model: MODEL, usage: err?.usage ?? null, cost, status: 'error', problems: [text], failed: true });
      budget?.save();
      calls.push({ attempt: attempts, model: MODEL, usage: null, cost, status: 'error' });
      return { err, text };
    }
    const m = res.msg ?? {};
    model = typeof m.model === 'string' && m.model ? m.model : MODEL;
    const usage = m.usage ?? {};
    const cost = costOf(usage, model);
    gate.add(cost);
    const out = m.stop_reason === 'end_turn' ? parseAnswer(m) : null;
    let status;
    let check = { hard: [], soft: [] };
    if (m.stop_reason === 'refusal') status = 'refused';
    else if (m.stop_reason !== 'end_turn') status = 'error';
    else {
      check = checkAnswer(out, item.sheet);
      status = check.hard.length ? 'failed' : 'ok';
    }
    const chars = out ? `${out.headline ?? ''}${out.reason ?? ''}${out.risk ?? ''}`.length : 0;
    budget?.record({ ...entry, model, usage, cost, status, problems: status === 'error' ? [`stopped: ${m.stop_reason ?? 'no answer'}`] : check.hard.slice(0, 8), ...(out?.stance ? { stance: out.stance } : {}), chars });
    budget?.save();
    calls.push({ attempt: attempts, model, usage, cost, status });
    return { m, out, status, check };
  };
  for (let k = 0; k < 2; k++) {
    const req = requestOf(item.sheet, { effort, maxTokens, fallbacks: cfg.fallbacks, problems });
    const res = await gate.through(worst, async () => {
      try {
        return account({ msg: await client.beta.messages.create(req, { timeout: CALL_TIMEOUT_MS, maxRetries: 0 }) });
      } catch (err) {
        return account({ err });
      }
    });
    if (res.capped) return { status: calls.length ? 'error' : 'skipped-budget', capped: res.capped, problems: problems ?? [`stopped at ${res.capped === 'run' ? "the run's limit" : res.capped === 'time' ? "the run's deadline" : 'the AI caps'}`], soft: [], calls, attempts, model };
    if (res.err) {
      if (badRequest(res.err)) return { status: 'rejected', problems: [`bad request: ${res.text}`], soft: [], calls, attempts, model };
      return { status: 'error', transient: true, problems: [res.text], soft: [], calls, attempts, model };
    }
    const { m, out, status, check } = res;
    if (status === 'refused') return { status: 'refused', problems: [`refused${m.stop_details?.category ? ` (${m.stop_details.category})` : ''}`], soft: [], calls, attempts, model };
    // (cut short: a failed try, asked again next run)
    if (status === 'error') return { status: 'error', problems: [`stopped: ${m.stop_reason ?? 'no answer'}`], soft: [], calls, attempts, model };
    if (status === 'ok') return { status: 'ok', out, problems: [], soft: check.soft, calls, attempts, model };
    problems = check.hard.slice(0, 8);
    log.log?.(`${item.sport}: ${item.pick ?? item.id}: draft ${k + 1} failed the grounding (${problems.join('; ').slice(0, 300)})`);
    if (k === 0 && out) item.draft = { headline: out.headline, reason: out.reason, risk: out.risk };
  }
  return { status: 'rejected', problems, soft: [], calls, attempts, model };
}

// (the first alone, so it writes the prompt's cache; the rest n at a time, reading it)
async function inTurn(items, n, fn) {
  if (!items.length) return;
  await fn(items[0]);
  let i = 1;
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// (usages added up)
function addUp(a, u) {
  const n = (v) => (fin(v) ? v : 0);
  a.input += n(u?.input_tokens);
  a.cacheWrite += n(u?.cache_creation_input_tokens);
  a.cacheRead += n(u?.cache_read_input_tokens);
  a.output += n(u?.output_tokens);
  return a;
}
const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// One sport's analyses (see above), its data in memory: { picks, ledger, state, games, writeups }, changed in
// place (writeups.items[id].ai, picks.picks' text). Returns the tally: { queue, written, retried, rejected,
// refused, errors, skipped, cost, usage, picksChanged, writeupsChanged, stopped }
// onItem: called after each bet's done (main saves writeups.json then)
export async function writeSport({ sport, data, client, budget, gate, cfg, now = new Date(), rewrite = false, log = console, onItem = null, guarded = guardedNow }) {
  const { picks, ledger, writeups } = data;
  writeups.items ??= {};
  const before = JSON.stringify(writeups);
  const queue = queueOf({ sport, picks, ledger, state: data.state, games: data.games, writeups, now, cfg, rewrite, guarded });
  const t = { queue: queue.length, written: 0, retried: 0, rejected: 0, refused: 0, errors: 0, skipped: 0, cost: 0, usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }, picksChanged: false, writeupsChanged: false, stopped: null };
  let inARow = 0;
  await inTurn(queue, cfg.concurrency ?? 3, async (item) => {
    if (t.stopped) return;
    const r = await writeOne(client, item, { budget, gate, cfg, log });
    for (const c of r.calls) {
      t.cost += c.cost;
      addUp(t.usage, c.usage);
    }
    if (r.calls.length > 1) t.retried++;
    if ((r.capped === 'run' || r.capped === 'time') && !r.calls.length) {
      t.skipped++;
      return;
    }
    if (r.status === 'error' && r.transient) inARow++;
    else if (r.calls.length) inARow = 0;
    if (inARow >= 3 && !t.stopped) {
      t.stopped = '3 errors in a row';
      log.warn?.(`${sport}: write-ups stopped for this run after 3 errors in a row (${r.problems.join('; ').slice(0, 160)})`);
    }
    if (r.status === 'ok') t.written++;
    else if (r.status === 'rejected') t.rejected++;
    else if (r.status === 'refused') t.refused++;
    else if (r.status === 'skipped-budget') t.skipped++;
    else t.errors++;
    const was = writeups.items[item.id] ?? {};
    const o = r.out ?? {};
    writeups.items[item.id] = {
      ...was,
      ai: {
        hash: item.hash,
        v: PROMPT_V,
        at: now.toISOString(),
        model: r.model,
        effort: cfg.effort,
        status: r.status,
        ...(r.status === 'ok' ? { headline: o.headline.trim(), reason: o.reason.trim(), risk: o.risk.trim(), stance: o.stance, numbers: o.numbers, cites: Array.isArray(o.cites) ? o.cites : [], ...(r.soft.length ? { soft: r.soft } : {}) } : { problems: r.problems }),
        ...(r.status === 'rejected' && item.draft ? { draft: item.draft } : {}),
        attempts: r.attempts,
        cost: Math.round(r.calls.reduce((s, c) => s + c.cost, 0) * 1e5) / 1e5,
        sheet: JSON.parse(JSON.stringify(item.sheet)),
      },
    };
    try {
      onItem?.();
    } catch (err) {
      log.warn?.(`${sport}: writeups.json not saved after ${item.id} (${String(err?.message ?? err).slice(0, 100)})`);
    }
  });
  // (the picks patched in place, as picks.mjs renders them every hour)
  const was = JSON.stringify(picks);
  for (const p of picks?.picks ?? []) {
    const e = writeups.items[p.id];
    if (e?.ai?.status === 'ok' && e.plain?.hash && e.ai.hash === e.plain.hash) applyWriteups(p, e, e.plain.hash);
  }
  t.picksChanged = JSON.stringify(picks) !== was;
  t.writeupsChanged = JSON.stringify(writeups) !== before;
  return t;
}

// The run's line, bet-desk style
export function runLine(sport, t, budget, cfg) {
  const s = budget?.spent?.() ?? { day: 0, month: 0 };
  const u = t.usage;
  return `writeups ${sport}: ${t.written} written, ${t.retried} retried, ${t.rejected} rejected${t.refused ? `, ${t.refused} refused` : ''}${t.errors ? `, ${t.errors} errors` : ''}${t.skipped ? `, ${t.skipped} skipped (caps)` : ''} of ${t.queue} due, $${t.cost.toFixed(2)} (${thousands(u.input)} in, ${thousands(u.cacheWrite)} cache write, ${thousands(u.cacheRead)} cache read, ${thousands(u.output)} out); today $${s.day.toFixed(2)} of $${cfg.caps.day.toFixed(2)}, month $${s.month.toFixed(2)} of $${cfg.caps.month}${t.stopped ? ` [${t.stopped}]` : ''}`;
}

// ---------------------------------------------------------------------------------------------------------
// --dry: the queue and its projected cost

// (a text's tokens, roughly: compact JSON and English run about 3.5 characters a token)
export const tokensOf = (text) => Math.ceil(String(text).length / 3.5);

// A queued bet's projected cost at an effort: { first, cached } (the run's first call writes the prompt's
// cache, the rest read it), output at the plan's tokens, a 15% retry allowance
export function projectedCost(sheet, effort) {
  const p = PRICES[MODEL];
  const sys = tokensOf(SYSTEM) + 250;
  const user = tokensOf(messageOf(sheet));
  const out = (PLAN_OUT[effort] ?? PLAN_OUT.high) * p.output;
  return { first: ((sys * p.cacheWrite + user * p.input + out) / 1e6) * 1.15, cached: ((sys * p.cacheRead + user * p.input + out) / 1e6) * 1.15 };
}

function dryReport(sport, queue, cfg, log) {
  if (!queue.length) {
    log.log?.(`writeups ${sport} (dry): none due`);
    return;
  }
  const lines = queue.map((it) => {
    // (built as it would be sent, so a request that can't be made shows here)
    const req = requestOf(it.sheet, { effort: cfg.effort, maxTokens: cfg.maxTokens, fallbacks: cfg.fallbacks });
    const chars = req.messages[0].content.length;
    return `  ${it.level} ${it.pick} (${it.id}): sheet ${chars} characters, ~${tokensOf(req.messages[0].content)} tokens`;
  });
  const total = (effort) => queue.reduce((s, it, i) => s + projectedCost(it.sheet, effort)[i ? 'cached' : 'first'], 0);
  log.log?.(`writeups ${sport} (dry): ${queue.length} due, nothing called; projected $${total('medium').toFixed(2)} at medium, $${total('high').toFixed(2)} at high, $${total('xhigh').toFixed(2)} at xhigh (the system prompt ~${tokensOf(SYSTEM)} tokens; worst case a call $${worstCase(cfg.maxTokens).toFixed(3)})\n${lines.join('\n')}`);
}

// ---------------------------------------------------------------------------------------------------------
// --validate: the owner's measured run

// The bets to measure: across the sports, the recent edge bets at LOVE or LOCK (their band when shown, else
// their Kelly score's), props and game lines apart, n of each, the sports in turn; where there aren't n, the
// best of the rest (by band, then the score). data: { [sport]: { ledger, state } }
export function validationPicks(data, { now = new Date(), props = 6, lines = 6, days = 30 } = {}) {
  const cands = { prop: [], line: [] };
  for (const sport of Object.keys(data)) {
    const { ledger, state } = data[sport] ?? {};
    for (const b of ledger?.bets ?? []) {
      if (intentOf(b) !== 'edge' || b.void || !fin(b.odds) || !fin(b.p) || !b.placedAt) continue;
      const age = now.getTime() - Date.parse(b.placedAt);
      if (!(age >= 0 && age <= days * 864e5)) continue;
      let score = null;
      try {
        score = scoreParts(b, state?.trust).score;
      } catch {
        score = null;
      }
      if (!fin(score)) continue;
      const level = b.publishedLevel ?? levelOf(b, score);
      (b.market === 'prop' ? cands.prop : cands.line).push({ sport, bet: b, level, score });
    }
  }
  const pick = (list, n) => {
    const sorted = list.sort((a, b) => levelRank(a.level) - levelRank(b.level) || b.score - a.score || String(b.bet.placedAt).localeCompare(String(a.bet.placedAt)));
    const strong = sorted.filter((c) => c.level === 'lock' || c.level === 'high');
    const rest = sorted.filter((c) => c.level !== 'lock' && c.level !== 'high');
    const out = [];
    // (the strong ones first, the sports in turn, then the rest the same way)
    for (const pool of [strong, rest]) {
      const by = new Map();
      for (const c of pool) by.set(c.sport, [...(by.get(c.sport) ?? []), c]);
      while (out.length < n && [...by.values()].some((l) => l.length)) for (const l of by.values()) if (l.length && out.length < n) out.push(l.shift());
    }
    return out;
  };
  return [...pick(cands.prop, props), ...pick(cands.line, lines)];
}

const cell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim() || '-';

// The report (markdown): the summary by effort (calls, the outcomes, the tokens, the dollars, $ a bet, the
// cache read from the 2nd call), then each bet with both efforts' texts side by side and their measured tokens
// and dollars. results: [{ sport, kind, pick, id, level, by: { [effort]: writeOne's result } }]
export function validateReport(results, { efforts = ['high', 'xhigh'], at = new Date(), cap = VALIDATE_CAP, spent = 0, stopped = null } = {}) {
  const out = [];
  const nProps = results.filter((r) => r.kind === 'prop').length;
  out.push('# Claude write-ups: the measured validation run', '');
  out.push(`Run ${at.toISOString()}, ${MODEL}, ${results.length} bets (${nProps} props, ${results.length - nProps} game lines) at ${efforts.join(' and ')}; $${spent.toFixed(2)} spent of the $${cap} cap${stopped ? ` (stopped: ${stopped})` : ''}. Prices are the skill's table (Opus 5.5: $4 in, $20 out, $5 cache write, $0.20 cache read a million tokens), to verify on the pricing page.`, '');
  out.push('## Summary', '');
  out.push('| Effort | Bets | Calls | ok | Rejected | Refused | Errors | Skipped | Input | Cache write | Cache read | Output | $ total | $ a bet written | Output a call |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const e of efforts) {
    const rs = results.map((r) => r.by?.[e]).filter(Boolean);
    const calls = rs.flatMap((r) => r.calls ?? []);
    const u = calls.reduce((a, c) => addUp(a, c.usage), { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
    const cost = calls.reduce((s, c) => s + (c.cost ?? 0), 0);
    const n = (s) => rs.filter((r) => r.status === s).length;
    const done = rs.filter((r) => r.calls?.length).length;
    out.push(`| ${e} | ${rs.length} | ${calls.length} | ${n('ok')} | ${n('rejected')} | ${n('refused')} | ${n('error')} | ${n('skipped-budget')} | ${thousands(u.input)} | ${thousands(u.cacheWrite)} | ${thousands(u.cacheRead)} | ${thousands(u.output)} | $${cost.toFixed(3)} | ${done ? `$${(cost / done).toFixed(3)}` : '-'} | ${calls.length ? thousands(u.output / calls.length) : '-'} |`);
  }
  const ordered = efforts.flatMap((e) => results.map((r) => r.by?.[e]).filter(Boolean)).flatMap((r) => r.calls ?? []);
  const later = ordered.slice(1).filter((c) => c.usage);
  out.push('', `Cache read from the 2nd call: ${later.length ? (later.some((c) => (c.usage.cache_read_input_tokens ?? 0) > 0) ? `yes (${later.filter((c) => (c.usage.cache_read_input_tokens ?? 0) > 0).length} of ${later.length} later calls)` : 'no (check the prompt for an invalidator)') : 'no later calls'}.`, '');
  results.forEach((r, i) => {
    out.push(`## ${i + 1}. ${r.sport.toUpperCase()} ${r.kind === 'prop' ? 'prop' : 'game line'}: ${cell(r.pick)} (${r.level}, ${r.id})`, '');
    out.push(`| | ${efforts.join(' | ')} |`, `|---|${efforts.map(() => '---').join('|')}|`);
    const row = (label, f) => out.push(`| ${label} | ${efforts.map((e) => cell(r.by?.[e] ? f(r.by[e]) : 'not run')).join(' | ')} |`);
    row('Headline', (x) => x.out?.headline ?? '');
    row('Reason', (x) => x.out?.reason ?? '');
    row("Devil's Advocate", (x) => x.out?.risk ?? '');
    row('Stance', (x) => x.out?.stance ?? '');
    row('Status', (x) => `${x.status}${x.problems?.length ? `: ${x.problems.join('; ')}` : ''}${x.soft?.length ? ` (soft: ${x.soft.join('; ')})` : ''}`);
    row('Calls', (x) => `${x.calls?.length ?? 0}${x.model && x.model !== MODEL ? ` (served by ${x.model})` : ''}`);
    row('Tokens (in / cache write / cache read / out)', (x) => {
      const u = (x.calls ?? []).reduce((a, c) => addUp(a, c.usage), { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
      return `${thousands(u.input)} / ${thousands(u.cacheWrite)} / ${thousands(u.cacheRead)} / ${thousands(u.output)}`;
    });
    row('Cost', (x) => `$${(x.calls ?? []).reduce((s, c) => s + (c.cost ?? 0), 0).toFixed(4)}`);
    out.push('');
  });
  return `${out.join('\n')}\n`;
}

// The measured run: the bets picked (validationPicks), each written at each effort in turn (the effort's first
// call alone, then one at a time: a measurement), its own cap (VALIDATE_CAP) and the month's, logged as
// 'writeup-validate'; nothing written but the report. Returns { results, report, spent, stopped }
export async function runValidate({ data, client, budget, now = new Date(), efforts = ['high', 'xhigh'], cap = VALIDATE_CAP, fallbacks = true, log = console }) {
  const chosen = validationPicks(data, { now });
  const gate = gateOf(budget, { cap });
  let stopped = null;
  const results = chosen.map(({ sport, bet, level }) => {
    const d = data[sport];
    const game = gameOf(d.games, bet.event);
    const sib = sibOf(bet, d.ledger.bets);
    const { hash, entry } = plainFor(bet, { game, sib, state: d.state, ledger: d.ledger, writeups: null });
    const rec = d.picks?.record?.byLevel?.[level];
    const sheet = aiSheetOf(bet, { game, sib, state: d.state, ledger: d.ledger, params: entry?.plain?.params ?? null, picksRecord: rec ? { won: rec.wins ?? 0, lost: rec.losses ?? 0 } : null, level });
    return { sport, kind: bet.market === 'prop' ? 'prop' : 'line', pick: bet.pick, id: bet.id, level, item: { sport, id: bet.id, pick: bet.pick, hash, sheet, attempts: 0 }, by: {} };
  });
  for (const effort of efforts) {
    const cfg = { effort, maxTokens: effort === 'xhigh' || effort === 'max' ? 12000 : 8000, fallbacks };
    for (const r of results) {
      if (stopped) {
        r.by[effort] = { status: 'skipped-budget', problems: [stopped], calls: [], soft: [] };
        continue;
      }
      const x = await writeOne(client, { ...r.item, draft: undefined }, { budget, gate, cfg, what: 'writeup-validate', log });
      r.by[effort] = x;
      if (x.capped) stopped = `the $${cap} cap or the month's`;
      log.log?.(`validate ${effort} ${r.sport} ${r.pick}: ${x.status}, $${x.calls.reduce((s, c) => s + c.cost, 0).toFixed(3)}`);
    }
  }
  const report = validateReport(results, { efforts, at: now, cap, spent: gate.spent, stopped });
  return { results, report, spent: gate.spent, stopped };
}

// ---------------------------------------------------------------------------------------------------------
// Files and the script

const filesOf = (sport) => ({
  picks: path.join(ROOT, 'apps', sport, 'src/StaticData/model/picks.json'),
  ledger: path.join(ROOT, 'apps', sport, 'src/StaticData/model/ledger.json'),
  state: path.join(ROOT, 'apps', sport, 'src/StaticData/model/state.json'),
  games: path.join(ROOT, 'apps', sport, 'scripts/model/games.json'),
  writeups: path.join(ROOT, 'apps', sport, 'scripts/model/writeups.json'),
});
const readIf = (file, fallback) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};
function loadSport(sport) {
  const f = filesOf(sport);
  const picks = readIf(f.picks, null);
  const ledger = readIf(f.ledger, null);
  if (!picks || !ledger?.bets) return null;
  return { files: f, picks, ledger, state: readIf(f.state, null), games: readIf(f.games, []), writeups: readIf(f.writeups, null) ?? { sport, items: {} } };
}

// (the SDK's client, loaded only when a call is due)
async function defaultClient(env) {
  const mod = await loadSdk();
  const Anthropic = mod.default ?? mod.Anthropic;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: CALL_TIMEOUT_MS });
}

const AI_USAGE = path.join(ROOT, '.cache/model/ai-usage.json');
const VALIDATE_OUT = path.join(ROOT, '.cache/writeups-validate.md');

async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const dry = flags.has('--dry');
  const sports = argv.filter((a) => !a.startsWith('--'));
  const list = sports.length ? sports.filter((s) => SPORTS.includes(s)) : SPORTS;
  // (the keys: .env on this machine; never on a dry run, which needs none)
  if (!dry) await import('../env.mjs');
  const env = process.env;
  const cfg = configOf(env);
  const now = new Date();
  if (!dry && !cfg.on && !flags.has('--validate')) return console.log('writeups: WRITEUPS=off: plain write-ups only');
  if (!dry && !env.ANTHROPIC_API_KEY) return console.log('writeups: no ANTHROPIC_API_KEY: plain write-ups only');
  if (flags.has('--validate')) {
    const data = Object.fromEntries(list.map((s) => [s, loadSport(s)]).filter(([, d]) => d));
    const budget = aiBudget({ file: AI_USAGE, floor: FLOOR_FILE, now, caps: { day: Number.MAX_SAFE_INTEGER, month: MONTH_CAP } });
    const client = await defaultClient(env);
    const { report, spent, stopped } = await runValidate({ data, client, budget, now, fallbacks: cfg.fallbacks });
    mkdirSync(path.dirname(VALIDATE_OUT), { recursive: true });
    writeFileSync(VALIDATE_OUT, report);
    budget.save();
    return console.log(`writeups --validate: $${spent.toFixed(2)} spent${stopped ? ` (stopped: ${stopped})` : ''}; the report in ${path.relative(ROOT, VALIDATE_OUT)}`);
  }
  const budget = aiBudget({ file: AI_USAGE, floor: FLOOR_FILE, now, caps: cfg.caps, dry });
  const gate = gateOf(budget, { maxPerRun: flags.has('--probe') ? 1 : cfg.maxPerRun, deadline: Date.now() + RUN_DEADLINE_MS });
  let client = null;
  for (const sport of list) {
    try {
      const data = loadSport(sport);
      if (!data) {
        console.log(`writeups ${sport}: no picks or ledger`);
        continue;
      }
      if (dry || flags.has('--count') || flags.has('--probe')) {
        const queue = queueOf({ sport, picks: data.picks, ledger: data.ledger, state: data.state, games: data.games, writeups: data.writeups, now, cfg, rewrite: flags.has('--rewrite') });
        if (dry) {
          dryReport(sport, queue, cfg, console);
          continue;
        }
        client ??= await defaultClient(env);
        if (flags.has('--count')) {
          for (const it of queue) {
            const req = requestOf(it.sheet, { effort: cfg.effort, maxTokens: cfg.maxTokens, fallbacks: false });
            const n = await client.messages.countTokens({ model: MODEL, system: req.system, messages: req.messages });
            console.log(`writeups ${sport} --count: ${it.pick}: ${n.input_tokens} input tokens`);
          }
          continue;
        }
        // (--probe: one live call, nothing written)
        if (!queue.length) continue;
        const r = await writeOne(client, queue[0], { budget, gate, cfg });
        console.log(`writeups --probe ${sport} ${queue[0].pick}: ${r.status}${r.problems.length ? ` (${r.problems.join('; ')})` : ''}, served by ${r.model}, $${r.calls.reduce((s, c) => s + c.cost, 0).toFixed(3)}`);
        break;
      }
      client ??= await defaultClient(env);
      // (writeups.json saved after each bet: a step killed mid-sport keeps what it paid for)
      const t = await writeSport({ sport, data, client, budget, gate, cfg, now, rewrite: flags.has('--rewrite'), onItem: () => writeFileSync(data.files.writeups, JSON.stringify(data.writeups)) });
      if (t.writeupsChanged) writeFileSync(data.files.writeups, JSON.stringify(data.writeups));
      if (t.picksChanged) writeFileSync(data.files.picks, JSON.stringify(data.picks));
      console.log(runLine(sport, t, budget, cfg));
    } catch (err) {
      // (never the job's failure: the plain text stays)
      console.warn(`::warning::writeups ${sport} failed (${String(err?.message ?? err).slice(0, 200)}): plain write-ups only`);
    }
  }
  budget.save();
}

// (only when run as the script itself: imported (the tests), it calls nothing)
if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    console.warn(`::warning::writeups failed (${String(err?.message ?? err).slice(0, 200)}): plain write-ups only`);
  }
}
