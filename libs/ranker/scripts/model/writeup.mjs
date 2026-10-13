// The plain write-ups: every pick's reason and its risk line (the Bets page's expanded row and its "Devil's
// Advocate"), written from the bet's own numbers by rule, free and the same every time. Pure: no I/O, no
// clock, no locale formatting (the AI runner builds on the same facts and checks its text with the same rules).
//
//   facts     factsOf: the bet as a fact sheet (schema v1), every number worked out and rounded once here, so
//             the writer (and a model writing from it) never does arithmetic: the price (the break-even, the
//             book's no-vig chance, the chance the desk bets, the edge, the gap to the market and its limit), a
//             prop's projection (his blended rate, his games, his recent form, the share of his games on this
//             side) and its drivers, a game's expected score and what its context saw, the fit and the record
//             (for the AI's analysis; the plain text doesn't read them)
//   drivers   driversOf: the steps from his blended rate to the projection, each by the effect it had here (the
//             fit's power on it: opp^a, script^b, the fit's scale), not the raw factor; the ones measured but
//             given no weight (notWeighed). The fit's params: the ones the bet was priced with (projection
//             .applied, props.mjs, since 2026-10), else the state's (its plain c the type's first context
//             term's), frozen with its text at its first write. The product of the steps must give the
//             projection back within 1%, or no driver is named: the text says only that the matchup and the
//             context take his rate to the projection, never that nothing moves it (that's said only when the
//             steps do give it back, each under half a percent), and where the params it was priced with are
//             unknown, his rate unblended (the blend's weight on recent form is the fit's, which a refit moves)
//   reason    plainOf: HOOK (the pick and what the model sees) + BUILD (a prop's rate and its drivers) + PRICE
//             (our chance, the break-even, the book's) + a CAVEAT or a game's context, 2 to 4 sentences, at
//             most 450 characters (trimmed in a fixed order: the second driver, the history, the caveat, last
//             season, then put back the most telling first where it still fits; the hook and the price never).
//             A slot's wording varies by the bet's id (fnv1a), never by the run. A CHECK (checks.mjs: too far
//             from the market to bet) says the disagreement and asks the question it raises instead of the price
//             (a role CHECK, cause 'role': the role change it's kept for, in words of its sub-reason's; a news
//             CHECK, cause 'news': the headline on his unit, news.mjs), led by the model's own Kelly on it ("Would
//             be a +26.80 Kelly bet on the model's own number"), then the two chances and the model's mean against
//             the one the book's price implies ("model 1.48 vs the book's 2.20 catches"), then why it isn't bet; a
//             projection near its line (fmt.near: within half a unit, or a line of 2.5 or under) said to two
//             decimals, so 1.48 against a 1.5 line isn't written 1.5
//   risk      the single likeliest way it loses, by the first rule that applies (a gap past the limit, the
//             game's lines held, his recent form against it, his history, the line's move, a teammate
//             questionable, a short season, a thin cushion, else how often it loses at our number), at most
//             220 characters, never the caveat the reason already said
//   frozen    hashOf: the bet's material facts (its side, line, price, chances, stake, projection and context,
//             and its game's context), never when it was seen, its close, its grading or the state: picks.mjs
//             keeps each pick's text (writeups.json) till that hash changes (a re-price) or PLAIN_V is bumped,
//             so the hourly refits never churn it
//   checked   validate: a text's numerals each a number on the sheet, its names the sheet's, no injury,
//             weather or rest talk the sheet doesn't hold, none of the banned words, the side and the line said
//             together; the plain text passes the same checks the AI's must (one that doesn't, on some field
//             it's never seen, falls back to its hook and its price sentence (a CHECK's question kept), never
//             stops the picks)

import { createHash } from 'node:crypto';
import { decimal, GAP } from './desk.mjs';
import { CHECK_KELLY } from './checks.mjs';

// (the plain text's version: bumped, every open bet's text is written again, free. 2: a prop whose drivers
// don't give its projection back no longer says nothing moves it. 3: a CHECK led by the model's Kelly and the
// book's implied mean, a projection near its line to two decimals, the CHECKs' risk said plainly. 4: a news
// CHECK's risk and one under the CHECK bar (a passed role's) never call its Kelly big)
export const PLAIN_V = 4;
export const REASON_MAX = 450;
export const RISK_MAX = 220;

// ---------------------------------------------------------------------------------------------------------
// Number formats (shared by the writer and the validator)

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
// (half-up with an epsilon: 5.55 to 5.6, never toFixed's 5.5; -0 as 0)
// (fmt.near's: the distance from the line, and the line, under which a projection's said to two decimals)
const NEAR_LINE = 0.5;
const NEAR_SMALL = 2.5;
const rnd = (x, d = 1) => {
  const k = 10 ** d;
  const v = (Math.sign(x) * Math.round(Math.abs(x) * k + 1e-9)) / k;
  return v === 0 ? 0 : v;
};
export const fmt = {
  fin,
  r: rnd,
  // (a projection or a rate: 1 decimal, whole at 100 or more)
  num: (x) => String(Math.abs(x) >= 100 ? rnd(x, 0) : rnd(x, 1)),
  // (a projection set against its line: two decimals where it's near (within NEAR_LINE, or a line of
  // NEAR_SMALL or under: a count's half a catch matters), else num's; ref, the number judged near (the mean,
  // for its distance from the line))
  near: (x, line, ref = x) => (fin(line) && fin(ref) && (Math.abs(ref - line) <= NEAR_LINE + 1e-9 || line <= NEAR_SMALL) ? rnd(x, 2).toFixed(2) : String(Math.abs(x) >= 100 ? rnd(x, 0) : rnd(x, 1))),
  // (a percent already a percent: whole, or d decimals)
  pct: (x, d = 0) => String(rnd(x, d)),
  odds: (a) => (a > 0 ? `+${a}` : String(a)),
  signed: (x) => (x > 0 ? `+${x}` : String(x)),
  line: (x) => String(x),
};
// (a sheet number: 3 decimals, so the text's 1-decimal or whole rounding is never a rounding of a rounding)
const r2 = (x) => (fin(x) ? rnd(x, 3) : undefined);

// (the bet's seed: a slot's wording by its id, the same every run)
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// (JSON with its keys sorted: the same facts, the same text, whatever order they were written in)
export function stableStringify(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
    .join(',')}}`;
}

// ---------------------------------------------------------------------------------------------------------
// Words

const NOUNS = {
  nfl: { passYds: 'passing yards', passAtt: 'pass attempts', passCmp: 'completions', passTd: 'TD passes', passInt: 'interceptions', rushYds: 'rushing yards', rushAtt: 'carries', recYds: 'receiving yards', rec: 'catches', rushRecYds: 'rushing and receiving yards' },
  nhl: { sog: 'shots on goal', pts: 'points', saves: 'saves' },
  mlb: { k: 'strikeouts', outs: 'outs', hits: 'hits', tb: 'total bases' },
  nba: { pts: 'points', reb: 'rebounds', ast: 'assists', fg3: 'threes', threes: 'threes', pra: 'points, rebounds and assists' },
};
const nounOf = (bet) => NOUNS[bet.sport]?.[bet.propType] ?? (bet.statLabel ? String(bet.statLabel).toLowerCase() : String(bet.propType ?? 'the stat'));
const PITCHER = new Set(['k', 'outs']);
const gamesNounOf = (bet) => ((bet.sport === 'nhl' && bet.propType === 'saves') || (bet.sport === 'mlb' && PITCHER.has(bet.propType)) ? 'starts' : 'games');
const ROLE = { WR: 'wide receivers', TE: 'tight ends', RB: 'running backs', QB: 'quarterbacks', S: 'starters', B: 'bench players' };
const roleNoun = (role) => (role ? (ROLE[String(role).replace(/[\d+]+$/, '')] ?? null) : null);
const UNIT = { nfl: 'points', nba: 'points', nhl: 'goals', mlb: 'runs' };
const FLOOR = { nfl: 0.5, nba: 0.5, nhl: 0.1, mlb: 0.2 };
const MARKET_WORD = { spread: 'spreads', total: 'totals', ml: 'moneylines' };
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const possessive = (s) => (/s$/.test(s) ? `${s}'` : `${s}'s`);
// (a or an before a number said aloud: an 8, an 11, an 18, an 80)
const an = (n) => (/^(8|11(D|$)|18(D|$))/.test(String(n)) ? 'an' : 'a');
const listOf = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// ---------------------------------------------------------------------------------------------------------
// The game's sides, a prop's team and opponent

// (a prop's sib: its game's own bet, the spread first, then the total, then the moneyline; a game bet its own)
export function sibOf(bet, bets = []) {
  if (bet.market !== 'prop') return bet;
  for (const m of ['spread', 'total', 'ml']) {
    const b = bets.find((x) => x.event === bet.event && x.market === m);
    if (b) return b;
  }
  return null;
}

// (the game's two abbreviations, and a prop's own team's side: home, away or unknown)
function sidesOf(bet, game) {
  const [away, home] = String(bet.matchup ?? '').split(' @ ');
  let mine = null;
  if (bet.market === 'prop' && bet.team !== null && bet.team !== undefined && game) {
    if (String(bet.team) === String(game.home)) mine = 'home';
    else if (String(bet.team) === String(game.away)) mine = 'away';
  }
  return { away: away || null, home: home || null, mine };
}

// ---------------------------------------------------------------------------------------------------------
// Applied drivers

// (the fit's power on each of a projection's parts, at its placement where it kept them (projection.applied),
// else the params given (the state's, frozen with the text at its first write))
const paramsOf = (bet, params) => bet.projection?.applied ?? params ?? null;

// The steps from his blended rate to the projection: { base, steps: [{ name, factor, appliedPct, raw }],
// notWeighed: [{ name, value }], ok } (ok: the product gives the projection back within 1%)
export function driversOf(bet, params) {
  const p = bet.projection;
  const P = paramsOf(bet, params);
  if (!p || !fin(p.mean) || !fin(p.rate)) return { base: null, steps: [], notWeighed: [], ok: false };
  const w = fin(P?.w) ? P.w : null;
  const recent = fin(p.recent) ? p.recent : p.rate;
  const base = w === null ? null : (1 - w) * p.rate + w * recent;
  const steps = [];
  const add = (name, factor, raw) => {
    if (fin(factor) && factor > 0) steps.push({ name, factor, appliedPct: rnd((factor - 1) * 100, 1), raw });
  };
  if (P) {
    add('scale', fin(P.scale) ? P.scale : 1, fin(P.scale) ? P.scale : 1);
    if (fin(p.opp) && fin(P.a)) add('opponent', Math.pow(p.opp, P.a), p.opp);
    if (fin(p.script) && fin(P.b)) add('script', Math.pow(p.script, P.b), p.script);
  }
  // (an old bet's ctx is its factor, a newer one's the terms' values beside their factor ctxF)
  const ctxF = fin(p.ctxF) ? p.ctxF : fin(p.ctx) ? p.ctx : 1;
  add('context', ctxF, p.ctx);
  if (p.funnelUsed) add('funnel', fin(p.funnelF) ? p.funnelF : 1, p.funnel);
  add('pace', fin(p.paceF) ? p.paceF : 1, p.paceF);
  add('targets', fin(p.tgtF) ? p.tgtF : 1, p.tgtF);
  add('vacated', fin(p.vacF) ? p.vacF : 1, p.vacF);
  // (the pull toward the stat's typical projection (project.mjs middleF): on a projection since it, none before)
  add('middle', fin(p.slF) ? p.slF : 1, p.slF);
  const product = base === null ? null : Math.max(0.05, steps.reduce((t, s) => t * s.factor, base));
  const ok = product !== null && Math.abs(product - p.mean) <= 0.01 * Math.max(p.mean, 0.05) + 0.005;
  const notWeighed = [];
  if (w === 0 && fin(p.recent)) notWeighed.push({ name: 'recent', value: p.recent });
  if (P && P.b === 0 && fin(p.script) && Math.abs(p.script - 1) >= 0.005) notWeighed.push({ name: 'script', value: p.script });
  if (p.role && p.roleUsed === false && fin(p.roleFactor)) notWeighed.push({ name: 'role', value: p.roleFactor });
  if (p.funnelUsed === false && fin(p.funnel) && p.funnel !== 0) notWeighed.push({ name: 'funnel', value: p.funnel });
  return { base, steps: ok ? steps.filter((s) => Math.abs(s.appliedPct) >= 0.5) : [], notWeighed, ok, product };
}

// (a driver's words: direction only, its number the applied one, said beside it)
function driverWhat(name, bet, sheet, raw) {
  const sport = bet.sport;
  const t = bet.propType;
  const opp = sheet.bet.opponent;
  const oppS = opp ? possessive(opp) : 'the opposing';
  const noun = sheet.bet.noun;
  if (name === 'scale') return `the fit scaling every player's ${noun} ${raw >= 1 ? 'up' : 'down'}`;
  if (name === 'opponent') {
    if (sport === 'nfl') {
      if (/^pass/.test(t)) return `${oppS} defense against quarterbacks`;
      if (t === 'rushYds' || t === 'rushAtt') return `${oppS} run defense`;
      return `${oppS} defense against ${roleNoun(bet.projection?.role) ?? 'his position'}`;
    }
    if (sport === 'nhl') return t === 'saves' ? `the shot volume goalies face against ${opp ?? 'his opponent'}` : `${oppS} defense`;
    if (sport === 'mlb') {
      if (t === 'k') return `${opp ? possessive(opp) : 'the opposing'} lineup, which strikes out ${raw < 1 ? 'less' : 'more'} than usual`;
      if (t === 'outs') return `how deep starters go against ${opp ?? 'the opposing lineup'}`;
      return `${oppS} pitching`;
    }
    if (sport === 'nba') return `${oppS} defense against ${roleNoun(bet.projection?.role) ?? 'his position'}`;
    return `${oppS} defense`;
  }
  if (name === 'script') {
    const g = sheet.game;
    // (a goalie's saves and a pitcher's outs follow the other side's scoring: project.mjs)
    const whoOpp = t === 'saves' || t === 'outs';
    const who = whoOpp ? opp : sheet.bet.team;
    const score = who && g?.expScore ? g.expScore[who] : undefined;
    return fin(score) ? `the game script, with ${who} expected to score ${fmt.num(score)}` : 'the game script';
  }
  if (name === 'funnel') return `${opp ?? 'the defense'} being a ${raw > 0 ? 'pass' : 'run'} funnel`;
  if (name === 'pace') return `${oppS} pace`;
  if (name === 'targets') return `where ${opp ?? 'the defense'} sends targets`;
  if (name === 'vacated') {
    const out = sheet.projection?.out ?? [];
    if (raw >= 1) return out.length ? `the work left by ${out.slice(0, 2).join(' and ')} out` : 'the work left by teammates out';
    return 'teammates back taking some of his work';
  }
  if (name === 'context') return ctxWhat(bet, sheet);
  if (name === 'middle') return raw >= 1 ? 'the fit pulling a low projection back up toward the typical one' : 'the fit pulling a high projection back toward the typical one';
  return name;
}

const FLAG_CTX = new Set(['rb1Out', 'newCoach', 'qb1Out']);
// (the context term that moved it most: its size times its value where the fit's sizes are known, else its value)
function ctxWhat(bet, sheet) {
  const ctx = bet.projection?.ctx;
  if (!ctx || typeof ctx !== 'object') return "the game's context";
  const P = paramsOf(bet, sheet._params) ?? {};
  const keys = Object.keys(ctx).filter((k) => fin(ctx[k]) && ctx[k] !== 0);
  if (!keys.length) return "the game's context";
  // (a 0-to-1 flag with no fitted size counts for nothing: its value isn't a size)
  const size = (k) => Math.abs((fin(P[`c_${k}`]) ? P[`c_${k}`] : FLAG_CTX.has(k) ? 0 : 1) * ctx[k]);
  const k = keys.sort((a, b) => size(b) - size(a) || a.localeCompare(b))[0];
  const v = ctx[k];
  const opp = sheet.bet.opponent;
  const words = {
    wind: `${fmt.num(Math.abs(v))} mph wind`,
    precip: 'rain in the forecast',
    snow: 'snow in the forecast',
    cold: 'the cold',
    backupQb: `${sheet.bet.team ?? 'his team'} starting a backup QB`,
    rb1Out: `${sheet.bet.team ?? 'his team'} ${v < 1 ? 'with its lead back questionable' : 'without its lead back'}`,
    newCoach: `${sheet.bet.team ?? 'his team'} in its first games under a new head coach`,
    // (by how surely he's missing (projection qb1Miss), not the term's value: that's under 1 for an out starter
    // once he's missed a game; neither known, both words)
    qb1Out: `${sheet.bet.team ?? 'his team'} ${!fin(bet.projection?.qb1Miss) ? 'without (or possibly without) its starting QB' : bet.projection.qb1Miss < 1 ? 'with its starting QB questionable' : 'without its starting QB'}`,
    b2b: 'a back-to-back',
    pp: 'his power-play time',
    ppTime: 'his power-play time',
    ppShare: v > 0 ? 'his spot on the top power-play unit' : 'his small share of the power play',
    oppShots: `${opp ? possessive(opp) : 'the opposing'} shot volume`,
    oppGoalie: 'the goalie he faces',
    leash: 'his pitch-count leash',
    restSp: 'his days between starts',
    ump: 'the plate umpire',
    slot: fin(sheet.projection?.slot) ? `batting ${ordinal(sheet.projection.slot)}` : 'his place in the lineup',
    platoon: 'the platoon matchup',
    oppSp: 'the pitcher he faces',
    usage: 'teammates out',
    blowout: 'the chance of a blowout',
  };
  return words[k] ?? "the game's context";
}

// ---------------------------------------------------------------------------------------------------------
// The fact sheet

const DROP_CTX = (c) => {
  if (!c || typeof c !== 'object') return c;
  const { seen: _seen, move, ...rest } = c;
  return move && typeof move === 'object' && 'now' in move ? { ...rest, move: { ...move, now: undefined } } : move ? { ...rest, move } : rest;
};

// The bet's material facts' hash: what its text is written from. Never when it was seen, its close, its CLV,
// its grading, its showing or publishing, or the state: those never write it again
export function hashOf(bet, sib) {
  const pick = (({ side, line, odds, model, fair, p, units, propType, projection, intent }) => ({ side, line, odds, model, fair, p, units, propType, projection, intent }))(bet);
  // (a role CHECK's cause, so a gap CHECK that becomes one is written again; none on the rest: their hash as it was)
  if (bet.cause === 'role') Object.assign(pick, { cause: bet.cause, roleReason: bet.roleReason ?? null });
  if (bet.cause === 'news') Object.assign(pick, { cause: bet.cause, newsUnit: bet.newsUnit ?? null, reason: bet.reason ?? null });
  const sibCtx = sib && sib !== bet && sib.context ? (({ seen: _s, move: _m, ...rest }) => rest)(sib.context) : null;
  const text = stableStringify({ bet: { ...pick, context: DROP_CTX(bet.context) ?? null }, sib: sibCtx });
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// (the kept context terms: a game market's on its side of the model (margin or total), a prop's its type's
// terms with a size)
function keptTermsOf(bet, state, params) {
  if (bet.market === 'prop') {
    const P = paramsOf(bet, params) ?? {};
    return Object.keys(P)
      .filter((k) => /^c_/.test(k) && fin(P[k]) && P[k] !== 0)
      .map((k) => ({ key: k.slice(2), label: k.slice(2), size: r2(P[k]), unit: 'log factor per unit' }));
  }
  const on = bet.market === 'total' ? 'total' : 'margin';
  return (state?.context?.terms ?? []).filter((t) => t.kept && t.on === on && fin(t.size)).map((t) => ({ key: t.key, label: t.label, size: r2(t.size), unit: t.unit }));
}

// (what the game's context saw, as short facts with the term that counts each, the ones a game bet says)
function situationOf(bet, ctx, away, home, kept) {
  const c = ctx ?? {};
  const s = c.starters ?? {};
  const w = c.weather ?? {};
  const out = [];
  const keptKey = new Set(kept.map((t) => t.key));
  const push = (text, ...terms) => out.push({ text, counted: terms.some((t) => keptKey.has(t)) });
  const team = [home, away];
  for (const n of c.ownerNotes ?? []) if (typeof n === 'string' && n) out.push({ text: n.replace(/^(Owner note|Research): /, (m) => m.toLowerCase()), counted: false, note: true });
  if (bet.sport === 'nfl') {
    for (const [i, qb] of [
      [0, s.home],
      [1, s.away],
    ]) {
      if (s.backup?.[i] > 0) push(`${team[i]} starts a backup QB${qb ? ` (${qb})` : ''}`, 'qb', 'qbT');
      else if (s.backup?.[i] < 0) push(`${team[i]} has its usual QB back${qb ? ` (${qb})` : ''}`, 'qb', 'qbT');
    }
    const outdoors = !w.roof || w.roof === 'outdoors' || w.roof === 'open';
    if (outdoors && fin(w.wind) && w.wind >= 12) push(`${w.wind} mph wind`, 'wind');
    if (fin(w.temp) && w.temp <= 35) push(`${w.temp} degrees at kickoff`, 'cold');
    if (fin(w.snow) && w.snow >= 0.5) push('snow in the forecast', 'snow', 'precip');
    else if (fin(w.precip) && w.precip >= 0.1) push('rain in the forecast', 'precip');
    const ol = c.more?.olChanged;
    for (const i of [0, 1]) if (fin(ol?.[i]) && ol[i] > 0) push(`${team[i]} has a reshuffled offensive line`, 'olChanges');
    if (fin(c.rest?.[0]) && fin(c.rest?.[1]) && Math.abs(c.rest[0] - c.rest[1]) >= 3) push(`${team[c.rest[0] > c.rest[1] ? 0 : 1]} has ${Math.abs(c.rest[0] - c.rest[1])} more days of rest`, 'rest');
  } else if (bet.sport === 'nhl') {
    if (s.home && s.away) push(`${s.away} vs ${s.home} in net`, 'goalie');
    for (const i of [0, 1]) if (c.b2b?.[i]) push(`${team[i]} played last night`, 'b2b');
  } else if (bet.sport === 'mlb') {
    if (s.home && s.away) push(`${s.away} vs ${s.home} on the mound`, 'pitcher', 'pitcherT');
    if (fin(w.windOut) && Math.abs(w.windOut) >= 8) push(`wind blowing ${w.windOut > 0 ? 'out' : 'in'} at ${Math.abs(w.windOut)} mph`, 'windOut');
  } else if (bet.sport === 'nba') {
    for (const i of [0, 1]) if (fin(s.missing?.[i]) && s.missing[i] >= 15) push(`${team[i]} is missing players worth ${Math.round(s.missing[i])} production a game`, 'missing', 'usage');
    for (const i of [0, 1]) if (c.b2b?.[i]) push(`${team[i]} played last night`, 'b2b');
  }
  return out;
}

// A bet's fact sheet (schema v1): its numbers worked out once, rounded once, absent ones left out. ctx: { game
// (games.json's), sib (its game's own bet: sibOf), state (trust, context terms, the props' fits), ledger (its
// record), picksRecord (the published bands'), params (a prop's fit params when the bet carries none) }
export function factsOf(bet, { game = null, sib = null, state = null, ledger = null, picksRecord = null, params = null } = {}) {
  const { away, home, mine } = sidesOf(bet, game);
  const isProp = bet.market === 'prop';
  const check = bet.intent === 'check';
  const kind = isProp ? 'prop' : bet.market;
  const team = isProp ? (mine === 'home' ? home : mine === 'away' ? away : null) : bet.side === 'home' ? home : bet.side === 'away' ? away : null;
  const opponent = isProp ? (mine === 'home' ? away : mine === 'away' ? home : null) : bet.side === 'home' ? away : bet.side === 'away' ? home : null;
  const sideWord = isProp || kind === 'total' ? bet.side : team;

  // (the price: what a unit pays, the break-even, the book's fair chance, ours, the gap, the parts of the edge)
  const b = fin(bet.odds) ? decimal(bet.odds) - 1 : null;
  const p0 = b ? 1 / (b + 1) : null;
  const scale = b ? (b + 1) / b : null;
  const score = b && fin(bet.p) ? (bet.p - p0) * scale : null;
  const priceP = b && fin(bet.fair) ? (bet.fair - p0) * scale : null;
  // (the model's own Kelly: its chance taken at its word, at the price; a CHECK's lead)
  const modelKelly = b && fin(bet.model) ? (bet.model - p0) * scale : null;
  const lean = fin(score) && fin(priceP) ? score - priceP : null;
  const key = isProp ? `prop:${bet.propType}` : bet.market;
  const trustRec = state?.trust?.[key] ?? null;
  const untested = isProp ? (bet.tested !== undefined ? !bet.tested : trustRec ? !trustRec.fitted : true) : trustRec ? !trustRec.fitted : false;
  const gap = fin(bet.model) && fin(bet.fair) ? bet.model - bet.fair : null;
  const limit = GAP[bet.market] ?? null;
  const edgePts = fin(score) ? (bet.p - p0) * 100 : null;
  const edgeFrom = !fin(score) || score <= 0 ? 'none' : priceP > 0.01 && lean > 0.01 ? 'both' : priceP > 0.01 ? 'price' : 'projection';
  const book = bet.book ?? 'DraftKings';
  const price = {
    breakEvenPct: p0 !== null ? r2(p0 * 100) : undefined,
    bookFairPct: r2(fin(bet.fair) ? bet.fair * 100 : NaN),
    bookFairFrom: bet.oddsAssumed ? 'an assumed even price' : bet.fairFrom === 'pinnacle' ? 'Pinnacle' : book,
    modelPct: r2(fin(bet.model) ? bet.model * 100 : NaN),
    betPct: r2(fin(bet.p) ? bet.p * 100 : NaN),
    lossPct: r2(fin(bet.p) ? 100 - bet.p * 100 : NaN),
    edgePts: r2(edgePts ?? NaN),
    modelKellyPct: r2(modelKelly !== null ? modelKelly * 100 : NaN),
    gapPts: r2(gap !== null ? Math.abs(gap) * 100 : NaN),
    gapLimitPts: limit ? r2(limit * 100) : undefined,
    pastGapLimit: gap !== null && !!limit && Math.abs(gap) > limit + 1e-9,
    leanSharePct: gap !== null && Math.abs(gap) > 1e-6 && fin(bet.p) ? r2(((bet.p - bet.fair) / gap) * 100) : undefined,
    untested,
    trust: fin(trustRec?.trust) ? trustRec.trust : undefined,
    gradedOfType: fin(trustRec?.n) ? trustRec.n : undefined,
    edgeFrom,
    winsToRepayLoss: b ? r2(1 / b) : undefined,
    // (the chances said whole, or to a decimal when the edge is under 5 points)
    decimals: edgePts !== null && Math.abs(edgePts) < 5 ? 1 : 0,
  };

  const sheet = {
    v: 1,
    bet: {
      id: bet.id,
      pick: bet.pick,
      sport: bet.sport,
      kind,
      ...(isProp ? { stat: bet.propType, statLabel: bet.statLabel ?? undefined, noun: nounOf(bet), gamesNoun: gamesNounOf(bet), player: bet.player ?? undefined } : {}),
      team: team ?? undefined,
      opponent: opponent ?? undefined,
      side: bet.side,
      sideWord: sideWord ?? undefined,
      line: fin(bet.line) ? bet.line : undefined,
      odds: bet.odds,
      ...(bet.oddsAssumed ? { oddsAssumed: true } : {}),
      book,
      matchup: bet.matchup,
      away: away ?? undefined,
      home: home ?? undefined,
      units: bet.units,
      hoursBeforeStart: bet.placedAt && bet.start ? r2((Date.parse(bet.start) - Date.parse(bet.placedAt)) / 36e5) : undefined,
      ...(check ? { check: true, checkReason: bet.reason ?? undefined, ...(bet.cause === 'role' ? { checkCause: 'role', roleReason: bet.roleReason ?? undefined } : bet.cause === 'news' ? { checkCause: 'news', newsUnit: bet.newsUnit ?? undefined } : {}) } : {}),
    },
    price,
  };

  // (the game: its expected score, its context's net and kept terms, its starters, weather, rest, flags, the
  // guard that held its lines: a game bet's own, a prop's from its game's bet)
  const g = isProp ? sib : bet;
  const em = fin(bet.expMargin) ? bet.expMargin : fin(sib?.expMargin) ? sib.expMargin : null;
  const et = fin(bet.expTotal) ? bet.expTotal : fin(sib?.expTotal) ? sib.expTotal : null;
  const gctx = g?.context ?? null;
  const kept = keptTermsOf(bet, state, params);
  const gs = {};
  if (away && home && em !== null && et !== null) {
    gs.away = away;
    gs.home = home;
    gs.expScore = { [away]: r2((et - em) / 2), [home]: r2((et + em) / 2) };
    gs.expMarginHome = r2(em);
    gs.expTotal = r2(et);
    gs.expMarginAbs = r2(Math.abs(em));
  }
  if (gctx) {
    if (fin(gctx.adj?.margin)) gs.contextNetMargin = r2(gctx.adj.margin);
    if (fin(gctx.adj?.total)) gs.contextNetTotal = r2(gctx.adj.total);
    if (gctx.starters) {
      const s = gctx.starters;
      gs.starters = { away: s.away ?? undefined, home: s.home ?? undefined };
      if (Array.isArray(s.backup)) gs.starters.backupQb = [s.backup[0] > 0 ? home : null, s.backup[1] > 0 ? away : null].filter(Boolean);
      if (Array.isArray(s.saved)) gs.starters.goalsSavedAboveExpectedPerGame = { [home]: r2(s.saved[0]), [away]: r2(s.saved[1]) };
      if (Array.isArray(s.vsUsual)) gs.starters.vsUsualStarter = { [home]: r2(s.vsUsual[0]), [away]: r2(s.vsUsual[1]) };
      if (Array.isArray(s.missing)) gs.starters.missing = { [home]: r2(s.missing[0]), [away]: r2(s.missing[1]) };
    }
    if (gctx.weather) {
      const w = gctx.weather;
      gs.weather = Object.fromEntries(['roof', 'temp', 'wind', 'windOut', 'precip', 'snow', 'forecast'].filter((k) => w[k] !== undefined && w[k] !== null).map((k) => [k, w[k]]));
    }
    if (Array.isArray(gctx.rest)) {
      gs.rest = { [home]: gctx.rest[0], [away]: gctx.rest[1] };
      if (fin(gctx.rest[0]) && fin(gctx.rest[1])) gs.restGap = Math.abs(gctx.rest[0] - gctx.rest[1]);
    }
    if (Array.isArray(gctx.b2b) && (gctx.b2b[0] || gctx.b2b[1])) gs.b2b = { [home]: !!gctx.b2b[0], [away]: !!gctx.b2b[1] };
    if (gctx.flags?.length) gs.flags = gctx.flags.filter((x) => typeof x === 'string');
    if (gctx.guard) gs.guard = gctx.guard;
    const mv = gctx.move;
    if (mv && ['spread', 'total', 'ml'].some((k) => fin(mv[k]) && mv[k] !== 0)) gs.moveSinceOpen = Object.fromEntries(['spread', 'total', 'ml'].filter((k) => fin(mv[k])).map((k) => [k, mv[k]]));
    if (!isProp && gctx.cap) gs.cap = gctx.cap;
    if (!isProp && gctx.oneSide) gs.oneSide = gctx.oneSide;
    if (gctx.ownerNotes?.length) gs.notes = gctx.ownerNotes.filter((x) => typeof x === 'string');
    if (!isProp) {
      gs.situation = situationOf(bet, gctx, away, home, kept);
      const m = gctx.starters?.missing;
      if (Array.isArray(m)) gs.missingRounded = m.filter(fin).map((x) => Math.round(x));
    }
  }
  if (bet.context?.ownerNotes?.length && isProp) gs.notes = [...(gs.notes ?? []), ...bet.context.ownerNotes.filter((x) => typeof x === 'string')];
  if (!isProp) {
    gs.keptTerms = kept;
    // (a spread's: the margin it loses by at the other side, its line's whole number past it)
    if (kind === 'spread' && fin(bet.line) && bet.line > 0) gs.lossAt = Number.isInteger(bet.line) ? bet.line + 1 : Math.ceil(bet.line);
    if (fin(bet.push)) gs.pushPct = r2(bet.push * 100);
  }
  if (Object.keys(gs).length) sheet.game = gs;

  // (a prop: its projection, his rates, his history at this line, the drivers that moved it)
  if (isProp && bet.projection) {
    const p = bet.projection;
    const P = paramsOf(bet, params);
    // (the params it was written with, for the context term's choice: kept off the sheet's own facts)
    Object.defineProperty(sheet, '_params', { value: P, enumerable: false });
    const w = fin(P?.w) ? P.w : null;
    const over = bet.side === 'over';
    const proj = {};
    if (fin(p.mean)) {
      proj.mean = r2(p.mean);
      if (fin(bet.line)) {
        proj.lineDiff = r2(p.mean - bet.line);
        proj.lineDiffAbs = r2(Math.abs(p.mean - bet.line));
      }
    }
    if (fin(p.rate)) proj.blendedRate = r2(w === null ? p.rate : (1 - w) * p.rate + w * (fin(p.recent) ? p.recent : p.rate));
    if (fin(p.rate)) proj.seasonRate = r2(p.rate);
    if (fin(p.games)) proj.gamesThisSeason = p.games;
    if (fin(p.lastSeason)) proj.gamesLastSeason = p.lastSeason;
    if (fin(p.recent)) {
      proj.recent = r2(p.recent);
      proj.recentN = 5;
    }
    if (w !== null) proj.recentWeightPct = r2(w * 100);
    if (fin(p.pOver)) proj.sideChancePct = r2((over ? p.pOver : 1 - p.pOver) * 100);
    // (the mean the book's price implies at the line (a CHECK's: props.mjs impliedMean), beside the model's)
    if (fin(p.implied)) proj.impliedMean = r2(p.implied);
    if (fin(p.fairOver)) proj.history = { sideSharePct: r2((over ? p.fairOver : 1 - p.fairOver) * 100), weightedGames: fin(p.record) ? p.record : undefined };
    if (fin(p.push)) proj.pushPct = r2(p.push * 100);
    if (Array.isArray(p.out) && p.out.length) proj.out = p.out;
    if (Array.isArray(p.questionable) && p.questionable.length) proj.questionable = p.questionable;
    if (fin(p.restDays)) proj.restDays = p.restDays;
    if (fin(p.slot)) proj.slot = p.slot;
    if (fin(p.ppTime)) proj.ppTime = p.ppTime;
    if (p.ctx && typeof p.ctx === 'object') proj.ctx = Object.fromEntries(Object.entries(p.ctx).filter(([, v]) => fin(v)).map(([k, v]) => [k, Math.abs(v)]));
    const d = driversOf(bet, params);
    sheet.driversOk = d.ok;
    // (params that don't give the projection back and weren't the ones it was priced with (a refit's): the
    // blend, its weight on recent form and what it gave no weight are theirs, not the bet's, so left off)
    const guessed = !d.ok && !p.applied;
    if (guessed) {
      delete proj.blendedRate;
      delete proj.recentWeightPct;
    }
    sheet.projection = proj;
    const drivers = d.steps.map((s) => ({ name: s.name, what: driverWhat(s.name, bet, sheet, s.raw), appliedPct: s.appliedPct, raw: fin(s.raw) ? r2(s.raw) : undefined }));
    if (drivers.length) sheet.drivers = drivers;
    const nw = d.notWeighed.filter((x) => !guessed || (x.name !== 'recent' && x.name !== 'script')).map((x) => ({ name: x.name, what: { recent: 'his recent form', script: 'the game script', role: 'the defense against his role', funnel: 'the defense as a funnel' }[x.name], value: r2(x.value) }));
    if (nw.length) sheet.notWeighed = nw;
    // (his line's move before the bet: against this side when it rose on an over or fell on an under)
    const open = bet.context?.move?.open;
    if (fin(open) && fin(bet.line) && open !== bet.line) sheet.lineBeforeBet = { open, atBet: bet.line, againstBet: over ? bet.line > open : bet.line < open };
    // (the fit: how this stat's projection did in its back-test)
    const type = (state?.props?.types ?? []).find((t) => t.key === bet.propType);
    if (type?.check) {
      const c = type.check;
      const pOverBand = fin(p.pOver) ? (c.calibration ?? []).find((x) => p.pOver >= x.band - 0.05 && p.pOver < x.band + 0.05) : null;
      sheet.fit = {
        stat: bet.statLabel,
        games: c.n,
        maeModel: r2(c.mae),
        maeOwnAverage: r2(c.maeBase),
        ...(pOverBand ? { calibrationAtThisChance: { saidPct: r2((over ? pOverBand.said : 1 - pOverBand.said) * 100), wasPct: r2((over ? pOverBand.was : 1 - pOverBand.was) * 100), n: pOverBand.n } } : {}),
        ...(fin(type.allPlayersBias) ? { allPlayersBias: r2(type.allPlayersBias) } : {}),
        ...(fin(c.bias) ? { listedPlayersBias: r2(c.bias) } : {}),
        unit: nounOf(bet),
      };
    }
  }

  // (the desk's own graded bets of this kind and side, and the published band's record)
  if (ledger?.bets) {
    const same = ledger.bets.filter((x) => x.market === bet.market && (!isProp || x.propType === bet.propType) && (isProp || kind === 'total' ? x.side === bet.side : true) && (x.status === 'won' || x.status === 'lost'));
    sheet.record = { thisTypeSide: { graded: same.length, won: same.filter((x) => x.status === 'won').length, lost: same.filter((x) => x.status === 'lost').length, units: r2(same.reduce((t, x) => t + (fin(x.profit) ? x.profit : 0), 0)) } };
  }
  if (picksRecord && sheet.record) sheet.record.publishedBand = picksRecord;
  sheet.notOnSheet = ['injury news after the bet', 'line moves after the bet', "the other side's price", 'betting splits'];
  return sheet;
}

// ---------------------------------------------------------------------------------------------------------
// The plain text

// (a chance at the sheet's precision)
const P = (sheet, k) => fmt.pct(sheet.price[k], sheet.price.decimals);

// (the price sentence: our chance, the break-even, the book's no-vig chance, where the edge comes from)
function priceSentence(sheet) {
  const { bet, price } = sheet;
  if (!fin(price.betPct) || !fin(price.breakEvenPct)) return null;
  const who = bet.kind === 'prop' || bet.kind === 'total' ? `the ${bet.side}` : bet.sideWord ?? 'it';
  const tail = bet.kind === 'spread' ? ' to cover' : bet.kind === 'ml' ? ' to win' : '';
  if (bet.oddsAssumed) return `The board had no price, so ${fmt.odds(bet.odds)} is assumed; we make ${who} ${P(sheet, 'betPct')}%${tail} against ${P(sheet, 'breakEvenPct')}%.`;
  const src = price.bookFairFrom === 'Pinnacle' ? 'Pinnacle' : bet.book;
  const fair = fin(price.bookFairPct) ? `, and ${possessive(src)} no-vig price says ${P(sheet, 'bookFairPct')}%` : '';
  let edge;
  if (price.edgeFrom === 'none') edge = ', so there is no edge at this price: a small action bet the desk takes for its data';
  else {
    const from = { projection: bet.kind === 'prop' ? 'the projection' : "the model's read of the game", price: 'the price itself', both: bet.kind === 'prop' ? 'the projection and a soft price' : 'the model and a soft price' }[price.edgeFrom];
    let trust = '';
    const label = bet.kind === 'prop' ? `${bet.statLabel ?? bet.noun} props` : `${bet.sport.toUpperCase()} ${MARKET_WORD[bet.kind] ?? 'bets'}`;
    if (price.untested) trust = bet.kind === 'prop' ? `, at half weight while ${label} are untested` : `, at its starting weight while ${label} are untested`;
    else if (price.trust === 0) trust = `; we give the model no weight on ${label} yet, so this is a price play`;
    else if (fin(price.trust) && price.trust > 0 && price.trust < 1 && price.edgeFrom !== 'price') trust = ', with the desk leaning only part of the way toward it';
    edge = `, so the edge is ${from}${trust}`;
  }
  return `We make ${who} ${P(sheet, 'betPct')}%${tail}; at ${fmt.odds(bet.odds)} it needs ${P(sheet, 'breakEvenPct')}%${fair}${edge}.`;
}

// (a role CHECK's words for its sub-reason (props.mjs roleChangeOf): no number or name of their own, so the
// validator's checks hold)
const ROLE_WORDS = {
  'backup-qb': "he is not his team's usual starting quarterback",
  'qb1-out': "his team's starting quarterback is out",
  'qb-change': 'his team is changing quarterbacks',
  'few-starts': 'he has made few starts, and the model reads a new starter poorly',
  'group-out': 'a regular at his position is out and a big share of that work is his to take',
  'snap-jump': 'his snaps jumped in his last game',
  'part-time': 'he is a part-timer with a regular at his position out',
  line: 'the line sits far from his projection, the market reading a role the model has not seen',
};

// (a CHECK's in place of the price: led by the model's own Kelly ("Would be a +26.80 Kelly bet on the model's
// own number"), then the two chances, the model's mean against the book's implied one ("model 1.48 vs the
// book's 2.20 catches"), then why it wasn't bet: the role, the news, or the gap)
function checkSentence(sheet) {
  const { bet, price, projection: pr } = sheet;
  const who = bet.kind === 'prop' || bet.kind === 'total' ? `the ${bet.side}` : bet.sideWord ?? 'its side';
  const src = price.bookFairFrom === 'Pinnacle' ? 'Pinnacle' : bet.book;
  const k = price.modelKellyPct;
  const kelly = fin(k) ? `Would be ${k < 0 ? 'a -' : 'a +'}${rnd(Math.abs(k), 2).toFixed(2)} Kelly bet on the model's own number` : null;
  const chances = fin(price.modelPct) && fin(price.bookFairPct) ? `${who} ${fmt.pct(price.modelPct)}% against ${possessive(src)} no-vig ${fmt.pct(price.bookFairPct)}%` : null;
  const means = fin(pr?.mean) && fin(pr?.impliedMean) && fin(bet.line) ? `model ${fmt.near(pr.mean, bet.line)} vs the book's ${fmt.near(pr.impliedMean, bet.line, pr.mean)} ${bet.noun}` : null;
  const lead = kelly ? `${kelly}${chances ? ` (${chances})` : ''}${means ? `; ${means}` : ''}.` : chances ? `The model makes ${chances}${means ? `; ${means}` : ''}.` : '';
  let why;
  if (bet.checkCause === 'news') why = `Not bet either way: the news on his team's ${bet.newsUnit ?? 'unit'} (${bet.checkReason ?? 'a change'}) is a change the model can't read from the logs yet.`;
  else if (bet.checkCause === 'role') why = `Not bet on this side: ${ROLE_WORDS[bet.roleReason] ?? 'his role is changing'}, the side a role change's known error could be making.`;
  else if (!fin(price.gapPts)) why = 'Not bet: the model is too far from the market to trust.';
  else {
    const gap = fmt.pct(price.gapPts, 1);
    why = `Not bet: ${an(gap)} ${gap}-point gap with nothing to explain it is more often the model missing something than value.`;
  }
  return join(lead, why);
}

// (a CHECK's question: what would settle the disagreement)
function checkQuestion(sheet) {
  const { bet, projection: pr, game } = sheet;
  if (bet.checkCause === 'role') return 'The question: how much of the work is his now, and has the market already priced it?';
  if (bet.checkCause === 'news') return 'The question: what the change does to his work, and has the market already priced it?';
  if (bet.kind === 'prop') {
    if (pr?.questionable?.length) return `The question: is ${listOf(pr.questionable.slice(0, 2))} playing, and does the market know his share of the work better?`;
    if (bet.stat === 'saves') return `The question: is ${bet.player ?? 'he'} confirmed in net, and what does the market see in the shots he'll face?`;
    if (bet.sport === 'mlb' && PITCHER.has(bet.stat)) return `The question: is ${bet.player ?? 'he'} on a normal pitch count, or does the market know of a limit?`;
    return 'The question: what does the market know that the model has not seen, a role change, a lineup or late news?';
  }
  const s = game?.starters;
  if (bet.sport === 'nhl' && s?.away && s?.home) return `The question: are ${s.away} and ${s.home} confirmed in net?`;
  if (bet.sport === 'mlb' && s?.away && s?.home) return `The question: are ${s.away} and ${s.home} confirmed on the mound?`;
  if (bet.sport === 'nfl' && s?.away && s?.home) return `The question: are ${s.away} and ${s.home} both starting, or is there news on the lines the model has not seen?`;
  return 'The question: what does the market know that the model has not seen?';
}

// (the pick as the board wrote it, else its side and line; " at" its price where it has one)
const pickOf = (bet) => (typeof bet.pick === 'string' && bet.pick ? bet.pick : [cap1(bet.sideWord ?? bet.side ?? ''), fin(bet.line) ? fmt.line(bet.line) : ''].filter(Boolean).join(' ') || 'This pick');
const atOdds = (bet) => (fin(bet.odds) ? ` at ${fmt.odds(bet.odds)}` : '');

// (a prop's hook: the pick and the projection against its line; a CHECK's, never bet, would be a play)
function propHook(sheet, seed, check = false) {
  const { bet, projection: pr } = sheet;
  const Side = cap1(bet.side ?? '');
  const forHim = bet.player ? ` for ${bet.player}` : '';
  if (!pr || !fin(pr.mean) || !fin(bet.line) || !Side) return fin(bet.line) && Side ? `${Side} ${fmt.line(bet.line)} ${bet.noun}${forHim}${atOdds(bet)}.` : `${pickOf(bet)}${atOdds(bet)}.`;
  const He = bet.player ?? 'He';
  const over = bet.side === 'over';
  const onSide = over ? pr.mean > bet.line : pr.mean < bet.line;
  // (the projection on the other side: right around the line, or a skewed count still likelier this side,
  // else a bet on the price alone)
  if (!onSide) {
    const close = Math.abs(pr.mean - bet.line) <= Math.max(0.5, 0.1 * Math.abs(bet.line));
    const likelier = fin(pr.sideChancePct) ? pr.sideChancePct >= 50 : close;
    if (!likelier) return `${He} projects for ${fmt.near(pr.mean, bet.line)} ${bet.noun}, ${over ? 'under' : 'over'} his line, so the ${bet.side} ${fmt.line(bet.line)} ${check ? 'would be a play' : 'is a bet'} on the price, not the likelier result.`;
    if (close) return `${He} projects right around the line (${fmt.near(pr.mean, bet.line)}), but the model still makes the ${bet.side} ${fmt.line(bet.line)} the likelier result.`;
    return `${He} projects for ${fmt.near(pr.mean, bet.line)} ${bet.noun}, ${over ? 'under' : 'over'} his line, but the model still makes the ${bet.side} ${fmt.line(bet.line)} the likelier result.`;
  }
  const ratio = bet.line > 0 ? pr.mean / bet.line : Infinity;
  const word = over ? (ratio >= 2 ? 'more than double his line' : ratio >= 1.15 ? 'comfortably over his line' : 'a bit over his line') : ratio <= 0.5 ? 'less than half his line' : ratio <= 0.85 ? 'comfortably under his line' : 'just under his line';
  if (seed & 1 && bet.player) return `${bet.player} projects for ${fmt.near(pr.mean, bet.line)} ${bet.noun}, ${word}, so the ${bet.side} ${fmt.line(bet.line)} ${check ? 'is the side' : 'is the bet'}.`;
  return `${Side} ${fmt.line(bet.line)} ${bet.noun}${forHim}: the model projects ${fmt.near(pr.mean, bet.line)}, ${fmt.near(pr.lineDiffAbs, bet.line, pr.mean)} ${over ? 'over' : 'under'} the line.`;
}

// (a prop's build: his blended rate, his games, his recent form where it's counted, then the drivers)
function propBuild(sheet, { d2 = true, last = true } = {}) {
  const { bet, projection: pr } = sheet;
  // (his blended rate where the params it was priced with are known, else his rate unblended)
  const rate = fin(pr?.blendedRate) ? pr.blendedRate : fin(pr?.seasonRate) ? pr.seasonRate : null;
  if (!pr || rate === null) return null;
  const gn = bet.gamesNoun;
  let games = '';
  if (fin(pr.gamesThisSeason)) {
    if (pr.gamesThisSeason === 0 && fin(pr.gamesLastSeason) && pr.gamesLastSeason > 0) games = last ? ` (none yet this season; it leans on last season's ${pr.gamesLastSeason})` : ' (none yet this season)';
    else if (pr.gamesThisSeason > 0) games = ` (${pr.gamesThisSeason} ${pr.gamesThisSeason === 1 ? gn.replace(/s$/, '') : gn} this season${last && fin(pr.gamesLastSeason) && pr.gamesLastSeason > 0 ? `, ${pr.gamesLastSeason} last season` : ''})`;
  }
  const recent = fin(pr.recentWeightPct) && pr.recentWeightPct > 0 && fin(pr.recent) ? `, ${fmt.num(pr.recent)} over his last 5` : '';
  const head = `His ${fin(pr.blendedRate) ? 'blended rate' : 'rate'} is ${fmt.num(rate)} a game${games}${recent}`;
  // (the drivers not giving the projection back: none named, and none said to be still; only the gap)
  if (!sheet.driversOk) {
    if (!fin(pr.mean) || fmt.num(pr.mean) === fmt.num(rate)) return `${head}, about where the model projects him.`;
    return `${head}; the matchup and the game's context take it to ${fmt.near(pr.mean, bet.line)}.`;
  }
  const ds = (sheet.drivers ?? []).slice().sort((a, b) => Math.abs(b.appliedPct) - Math.abs(a.appliedPct) || a.name.localeCompare(b.name)).slice(0, d2 ? 2 : 1);
  if (!ds.length) return `${head}, and nothing in the matchup moves it much.`;
  const parts = ds.map((x) => `${x.what} (${fmt.signed(x.appliedPct)}% here)`);
  const signs = new Set(ds.map((x) => Math.sign(x.appliedPct)));
  const one = ds.length === 1;
  const verb = signs.size > 1 ? (one ? 'moves it' : 'move it') : signs.has(-1) ? (one ? 'brings it down' : 'bring it down') : one ? 'pushes it up' : 'push it up';
  // (a phrase with its own comma closes with one before the verb)
  return `${head}; ${parts.join(' and ')}${parts.some((x) => x.includes(',')) ? ',' : ''} ${verb} to the projection.`;
}

// (a prop's history: the share of his weighted games on this side of the line)
function propHistory(sheet) {
  const h = sheet.projection?.history;
  const line = sheet.bet.line;
  if (!h || !fin(h.sideSharePct) || !fin(line) || !fin(h.weightedGames) || h.weightedGames < 4) return null;
  return `${fmt.pct(h.sideSharePct)}% of his weighted games ${sheet.bet.side === 'over' ? 'went over' : 'stayed under'} ${fmt.line(line)}.`;
}

// The caveats and the risks, each rule's words or null where it doesn't apply
function rulesOf(sheet) {
  const { bet, price, projection: pr, game } = sheet;
  const over = bet.side === 'over';
  const guard = game?.guard ?? (game?.flags?.length ? game.flags[0] : null);
  const r = {};
  if (price.pastGapLimit && fin(price.gapPts) && fin(price.gapLimitPts)) r.gap = `the model is ${fmt.pct(price.gapPts, 1)} points from the market, past the ${fmt.pct(price.gapLimitPts)}-point gap the desk now bets; a gap that size is more often news it hasn't seen than an edge.`;
  if (bet.kind === 'prop' && guard) r.c1 = `when this was priced, the game's own lines were held (${guard}).`;
  const lb = sheet.lineBeforeBet;
  if (lb?.againstBet) r.c2 = `the line had already moved from ${fmt.line(lb.open)} to ${fmt.line(lb.atBet)} before the bet.`;
  if (pr && fin(pr.recent) && fin(bet.line) && pr.recentWeightPct === 0 && (over ? pr.recent < bet.line : pr.recent > bet.line)) r.c3 = `his last 5 averaged ${fmt.num(pr.recent)}, the other side of the line, and the fit gives that no weight.`;
  const against = (sheet.drivers ?? []).filter((d) => (over ? d.appliedPct <= -3 : d.appliedPct >= 3)).sort((a, b) => Math.abs(b.appliedPct) - Math.abs(a.appliedPct))[0];
  if (against) r.c4 = over ? `${against.what} takes ${fmt.pct(Math.abs(against.appliedPct), 1)}% off.` : `${against.what} adds ${fmt.pct(Math.abs(against.appliedPct), 1)}%.`;
  if (pr?.questionable?.length) r.c5 = `${listOf(pr.questionable.slice(0, 2))} ${pr.questionable.length > 1 ? 'were' : 'was'} questionable when it was priced.`;
  if (pr && fin(pr.gamesThisSeason) && pr.gamesThisSeason <= 3) r.c6 = pr.gamesThisSeason === 0 ? `no ${bet.gamesNoun} yet this season.` : `only ${pr.gamesThisSeason} ${pr.gamesThisSeason === 1 ? bet.gamesNoun.replace(/s$/, '') : bet.gamesNoun} this season.`;
  if (fin(price.edgePts) && price.edgePts > 0 && price.edgePts < 2) r.c7 = `the cushion over break-even is thin (${P(sheet, 'betPct')}% against ${P(sheet, 'breakEvenPct')}%).`;
  if (pr?.history && fin(pr.history.sideSharePct) && pr.history.sideSharePct < 45 && fin(bet.line)) r.hist = `only ${fmt.pct(pr.history.sideSharePct)}% of his weighted games landed on this side of ${fmt.line(bet.line)}.`;
  if (fin(price.lossPct)) r.generic = `it loses ${P(sheet, 'lossPct')}% of the time even at our number.`;
  return r;
}

// (a game line's hook: the pick and the expected score)
function gameHook(sheet) {
  const { bet, game } = sheet;
  const sc = game?.expScore;
  if (!sc || !bet.away || !bet.home || !fin(sc[bet.away]) || !fin(sc[bet.home])) return `${pickOf(bet)}${atOdds(bet)}.`;
  const a = fmt.num(sc[bet.away]);
  const h = fmt.num(sc[bet.home]);
  if (bet.kind === 'total') return `${cap1(bet.side)} ${fmt.line(bet.line)}: the model expects ${fmt.num(game.expTotal)} (${bet.away} ${a}, ${bet.home} ${h}).`;
  const team = bet.sideWord;
  const other = team === bet.home ? bet.away : bet.home;
  if (bet.kind === 'ml' || !fin(bet.line) || bet.line === 0 || !team) return `${team ?? pickOf(bet)} to win: the model has it ${bet.away} ${a}, ${bet.home} ${h}.`;
  const mine = sc[team];
  const theirs = sc[other];
  const head = fmt.num(mine) === fmt.num(theirs) ? `${pickOf(bet)}: the model has it level at ${fmt.num(mine)} each` : `${pickOf(bet)}: the model has ${team} ${mine > theirs ? 'winning' : 'losing'} ${fmt.num(mine)} to ${fmt.num(theirs)}`;
  const margin = rnd(Math.abs(mine - theirs), 2);
  if (bet.line > 0) {
    if (mine >= theirs) return `${head}, so it loses only if ${other} wins by ${game.lossAt} or more.`;
    return margin < bet.line ? `${head}, inside the ${fmt.line(bet.line)} it's getting.` : `${head}, by more than the ${fmt.line(bet.line)} it's getting.`;
  }
  if (mine < theirs) return `${head}; it has to win by more than ${fmt.line(Math.abs(bet.line))} to cover.`;
  return `${head}, ${margin > Math.abs(bet.line) ? 'more' : 'less'} than the ${fmt.line(Math.abs(bet.line))} it has to cover.`;
}

// (a game line's context: at most two facts, each said counted where its term is kept, then the net)
function gameContext(sheet, n = 2, net = true) {
  const { bet, game } = sheet;
  const facts = (game?.situation ?? []).slice(0, n).map((f) => `${f.text}${f.counted ? ', a term the model counts' : ''}`);
  const out = [];
  if (facts.length) out.push(`${cap1(facts.join('; '))}.`);
  if (net && game) {
    const adj = bet.kind === 'total' ? game.contextNetTotal : game.contextNetMargin;
    const floor = FLOOR[bet.sport] ?? 0.5;
    if (fin(adj) && Math.abs(adj) > floor) {
      const dir = bet.kind === 'total' ? (adj > 0 ? 'up' : 'down') : `toward ${adj > 0 ? bet.home : bet.away}`;
      out.push(`In all, the context moves the ${bet.kind === 'total' ? 'total' : 'margin'} ${fmt.num(Math.abs(adj))} ${UNIT[bet.sport] ?? 'points'} ${dir}.`);
    } else if (fin(adj)) out.push('The situational factors barely move it.');
  }
  return out.join(' ');
}

// (the first text no longer than max, or the last one: the shortest)
const fit = (texts, max) => texts.find((t) => t.length <= max) ?? texts[texts.length - 1];
const join = (...xs) => xs.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

// A sheet's plain write-up: { reason, risk }
export function plainOf(sheet) {
  const { bet, price } = sheet;
  const seed = fnv1a(bet.id ?? bet.pick ?? '');
  const lead = ['Worth knowing:', 'The catch:', 'Keep in mind:'][seed % 3];
  const rules = rulesOf(sheet);
  const check = !!bet.check;
  let reason;
  let caveatRule = null;
  // (the last resorts, longest first: the hook and the price (a CHECK's its disagreement and its question,
  // the pick's own short hook before the question is ever dropped))
  let floors;
  if (bet.kind === 'prop') {
    const hook = propHook(sheet, seed >>> 3, check);
    const priceText = check ? checkSentence(sheet) : priceSentence(sheet);
    const push = sheet.projection?.pushPct >= 4 ? `Exactly ${fmt.line(bet.line)} is a push (${fmt.pct(sheet.projection.pushPct)}%).` : null;
    const caveatKey = check ? null : ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].find((k) => rules[k]);
    const caveat = caveatKey ? `${lead} ${rules[caveatKey]}` : null;
    const question = check ? checkQuestion(sheet) : null;
    const hist = propHistory(sheet);
    // (trimmed in order: the second driver, the history, the caveat (still the risk), last season, the push,
    // the build; then each one dropped put back, the most telling first, where it still fits)
    const compose = (on) => join(hook, on.build ? propBuild(sheet, { d2: on.d2, last: on.last }) : null, on.hist ? hist : null, priceText, on.push ? push : null, on.caveat ? caveat : null, question);
    const order = ['d2', 'hist', 'caveat', 'last', 'push', 'build'];
    const on = Object.fromEntries(order.map((k) => [k, true]));
    const dropped = [];
    for (const k of order) {
      if (compose(on).length <= REASON_MAX) break;
      on[k] = false;
      dropped.push(k);
    }
    for (const k of dropped.reverse()) {
      on[k] = true;
      if (compose(on).length > REASON_MAX) on[k] = false;
    }
    reason = compose(on);
    floors = check ? [join(hook, priceText, question), join(`${pickOf(bet)}${atOdds(bet)}.`, priceText, question), join(hook, priceText)] : [join(hook, priceText)];
    if (reason.length > REASON_MAX) reason = fit(floors, REASON_MAX);
    caveatRule = on.caveat && caveat && reason.includes(caveat) ? caveatKey : null;
  } else {
    const hook = gameHook(sheet);
    const priceText = check ? checkSentence(sheet) : priceSentence(sheet);
    const push = !check && fin(sheet.game?.pushPct) && sheet.game.pushPct >= 2 ? `It pushes about ${fmt.pct(sheet.game.pushPct)}% of the time.` : null;
    const question = check ? checkQuestion(sheet) : null;
    floors = check ? [join(hook, priceText, question), join(`${pickOf(bet)}${atOdds(bet)}.`, priceText, question), join(hook, priceText)] : [join(hook, priceText)];
    reason = fit([join(hook, priceText, push, gameContext(sheet, 2, true), question), join(hook, priceText, push, gameContext(sheet, 1, true), question), join(hook, priceText, gameContext(sheet, 1, false), question), ...floors], REASON_MAX);
  }
  // (the risk: the first rule that applies, never the caveat the reason said)
  let risk;
  if (check) {
    // (said plainly: a big Kelly on the model's own number has won at about the book's rate (2026-10, 509 of
    // them at +10 or more), and the gap's CHECKs lost far more than they won). Big only where it is: a role's at
    // the CHECK bar or over (checks.mjs CHECK_KELLY), never a news CHECK's (one at any Kelly)
    const big = fin(sheet.price?.modelKellyPct) && sheet.price.modelKellyPct >= CHECK_KELLY * 100;
    risk = bet.checkCause === 'news' ? "The news on his team is a change the market prices faster than the model reads it from the logs, so the model's own number isn't value by itself." : bet.checkCause === 'role' ? `${big ? 'A big Kelly on the model' : 'The model'}'s own number isn't value by itself: such numbers have won at about the book's rate, and a role change is news the market prices faster than the model reads it.` : 'A gap that size has more often been the model missing something than an edge: the gap CHECKs lost far more than they won, so it is not bet.';
  } else {
    const g = sheet.game ?? {};
    const order =
      bet.kind === 'prop'
        ? ['gap', 'c1', 'c3', 'hist', 'c2', 'c5', 'c6', 'c7', 'generic'].map((k) => (k === caveatRule ? null : rules[k]))
        : [
            rules.gap,
            bet.odds <= -200 && fin(price.winsToRepayLoss) && fin(price.edgePts) ? `at ${fmt.odds(bet.odds)} one loss takes ${fmt.pct(price.winsToRepayLoss, 2)} wins to repay${price.edgePts > 0 ? `; the edge is ${fmt.pct(price.edgePts, 1)} points` : ', and it has no edge at this price'}.` : null,
            g.flags?.length ? `it was priced with a worry on the game: ${g.flags[0]}.` : null,
            bet.sport === 'nfl' && g.weather?.forecast && fin(bet.hoursBeforeStart) && bet.hoursBeforeStart > 72 && (g.keptTerms ?? []).some((t) => /wind|precip|cold|snow/i.test(t.key)) ? 'it was priced off a forecast more than 3 days out, and the model counts the weather.' : null,
            g.cap ? `its stake was capped (${g.cap}).` : g.oneSide ? `its side was set by the game's other market (${g.oneSide}).` : null,
            rules.c7,
            rules.generic,
          ];
    risk = order.filter(Boolean).map(cap1).find((t) => t.length <= RISK_MAX) ?? '';
  }
  // (a text the validator rejects, on some field it's never seen: the last resorts, with its risk, then with
  // the plain loss rate's; none passing, the text as written (the picks never wait on it))
  if (validate(`${reason} ${risk}`, sheet).length) {
    const plainRisk = check ? risk : rules.generic ? cap1(rules.generic) : '';
    const safe = floors.flatMap((r) => [[r, risk], [r, plainRisk]]).find(([r, k]) => r.length <= REASON_MAX && !validate(`${r} ${k}`, sheet).length);
    if (safe) [reason, risk] = safe;
  }
  return { reason, risk };
}

// ---------------------------------------------------------------------------------------------------------
// The validator (the plain text's and the AI's)

// (the desk's own words on the sheet (a guard, a flag, a note, a CHECK's reason): quoted, never checked)
function freeText(sheet) {
  const g = sheet.game ?? {};
  return [sheet.bet?.checkReason, g.guard, g.cap, g.oneSide, ...(g.flags ?? []), ...(g.notes ?? []), ...(g.situation ?? []).filter((f) => f.note).map((f) => f.text)].filter((x) => typeof x === 'string' && x);
}

// Every number on the sheet with the forms it may be written in (itself, and rounded to 0, 1 or 2 decimals)
export function numbersIn(sheet) {
  const set = new Set();
  const walk = (v, key) => {
    if (fin(v)) {
      const a = Math.abs(v);
      for (const x of [a, rnd(a, 0), rnd(a, 1), rnd(a, 2)]) set.add(x);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === 'string' && key !== 'checkReason' && key !== 'guard') {
      // (a pick's or a name's own numerals: "Over 8.5", "5th")
      for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) set.add(Number(m[0]));
    }
  };
  walk(sheet, '');
  return set;
}

// (the people and teams on the sheet)
function namesIn(sheet) {
  const b = sheet.bet ?? {};
  const g = sheet.game ?? {};
  const pr = sheet.projection ?? {};
  const s = g.starters ?? {};
  return [b.player, b.team, b.opponent, b.away, b.home, b.sideWord, s.away, s.home, ...(pr.out ?? []), ...(pr.questionable ?? [])].filter((x) => typeof x === 'string' && x.length > 1 && !/^(over|under)$/.test(x));
}

// (every string on the sheet, for the names check)
function stringsIn(sheet) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        out.push(k);
        walk(x);
      }
    }
  };
  walk(sheet);
  return out.join(' | ');
}

const ALLOW = new Set(['DraftKings', 'Pinnacle', 'Over', 'Under', 'LOVE', 'LOCK', 'LIKE', 'PASS', 'CHECK', 'CHECKs', 'Kelly', 'ML', 'QB', 'QBs', 'NFL', 'NBA', 'NHL', 'MLB', 'ET', 'OL', 'TD', 'TDs', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
const STARTERS = new Set(['The', 'This', 'That', 'Would', 'At', 'If', 'His', 'He', 'With', 'But', 'And', 'Even', 'On', 'What', 'Two', 'One', 'It', 'Its', 'A', 'An', 'So', 'Still', 'Where', 'When', 'Both', 'Against', 'Only', 'Over', 'Under', 'Across', 'We', 'Exactly', 'Worth', 'Keep', 'Not', 'In', 'Is', 'Are', 'No', 'Owner', 'There', 'Then', 'They', 'Their', 'Our', 'Here', 'For', 'To', 'As', 'By', 'From', 'After', 'Before', 'Because', 'Since', 'Though', 'Although', 'While', 'Despite', 'Given', 'Without', 'Unless', 'Also', 'Yet', 'Or', 'However', 'Instead', 'All', 'Some', 'Most', 'Much', 'Every', 'Each', 'Nothing', 'Neither', 'Goalies', 'Goalie', 'Pitchers', 'Starters', 'Receivers', 'Players', 'Teams', 'Defenses']);
const WORDS = /\b(four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred|dozen|third|thirds|quarter|quarters)\b/i;
const BANNED = /sharp|public money|steam|handle|reverse line|streak|hot hand|momentum|revenge|motivat|coach|must-win|playoff|guarantee|can't lose|free money|\block\b|hammer|smash|empty[- ]net|reportedly|rumou?r|historically|trade|suspend/i;
const has = (x) => x !== undefined && x !== null && !(Array.isArray(x) && !x.length);

// A text's problems against its sheet (none: it passes). numbers: the AI's [{ text, fact }] (each numeral it
// wrote and the sheet path it came from); without them each numeral is checked against every number on the sheet.
// reason: the part the side and the line are checked in (the whole text without it; a risk may say how the
// other side wins). A line break ends a sentence (a headline above its reason)
export function validate(text, sheet, numbers = null, { reason = text } = {}) {
  const problems = [];
  let t = String(text ?? '');
  for (const s of freeText(sheet)) t = t.split(s).join(' ');
  // (the sheet's names and abbreviations, for the word checks: Jalen Hurts isn't injury talk, Chandler isn't
  // a handle, TEN isn't a number word)
  const bare = namesIn(sheet)
    .sort((a, b) => b.length - a.length)
    .reduce((x, n) => x.split(n).join(' '), t);
  // 1. numerals
  const all = numbersIn(sheet);
  const listed = numbers ? new Map(numbers.map((n) => [String(n.text).replace(/[,%]/g, ''), n.fact])) : null;
  for (const m of t.matchAll(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,/g, '');
    const v = Math.abs(Number(raw));
    if (Number.isInteger(v) && v <= 3) continue;
    if (listed) {
      const key = raw.replace(/^\+/, '');
      const fact = listed.get(raw) ?? listed.get(key) ?? listed.get(String(v));
      if (!fact) problems.push(`numeral ${m[0]} not listed`);
      else {
        const at = String(fact)
          .split('.')
          .reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), sheet);
        if (!fin(at) || ![Math.abs(at), rnd(Math.abs(at), 0), rnd(Math.abs(at), 1), rnd(Math.abs(at), 2)].includes(v)) problems.push(`numeral ${m[0]} is not ${fact}`);
      }
    }
    if (!all.has(v)) problems.push(`numeral ${m[0]} not on the sheet`);
  }
  if (WORDS.test(bare)) problems.push(`number word: ${bare.match(WORDS)[0]}`);
  // 2. names
  const names = stringsIn(sheet);
  const words = [...t.matchAll(/(\s*)(\S+)/g)].map((m) => ({ w: m[2], br: m[1].includes('\n') }));
  words.forEach(({ w, br }, i) => {
    const tok = w.replace(/^[("'[]+/, '').replace(/['’]s?[),.;:!?]*$|[),.;:!?]+$/g, '');
    if (!/^[A-Z]/.test(tok)) return;
    const initial = i === 0 || br || /[.!?]["')]?$/.test(words[i - 1].w);
    if (ALLOW.has(tok) || names.includes(tok)) return;
    if (initial && STARTERS.has(tok)) return;
    problems.push(`name not on the sheet: ${tok}`);
  });
  // 3. topics the sheet must hold
  const pr = sheet.projection ?? {};
  const g = sheet.game ?? {};
  const ctx = pr.ctx ?? {};
  if (/injur|hurt|ruled out|sidelined|day-to-day/i.test(bare) && !has(pr.out) && !has(pr.questionable)) problems.push('injury talk without an injury on the sheet');
  // (weather words as weather: not a cold streak or a player's shooting gone cold, a hockey or basketball turn of
  // phrase)
  if (/(wind|winds|windy|rain|rainy|snow|snowy|weather|forecast)|cold (weather|temperatures?|game|night)|d+s*°/i.test(bare) && !has(g.weather) && !['wind', 'precip', 'snow', 'cold'].some((k) => has(ctx[k]))) problems.push('weather talk without weather on the sheet');
  if (/\brest|back-to-back|travel|fatigue|tired/i.test(bare) && !has(g.rest) && !has(g.b2b) && !has(pr.restDays) && !has(ctx.b2b)) problems.push('rest talk without rest on the sheet');
  // 4. banned outright
  if (BANNED.test(bare)) problems.push(`banned: ${bare.match(BANNED)[0]}`);
  // 5. the side and the line, said together; never the other side at the same line
  const { side, line, kind, sideWord } = sheet.bet ?? {};
  if (fin(line) && sideWord && kind !== 'ml') {
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lineRe = esc(Math.abs(line));
    const near = new RegExp(`\\b${esc(sideWord)}\\b.{0,40}?[-+]?${lineRe}(?![\\d.]\\d)|[-+]?${lineRe}\\b.{0,40}?\\b${esc(sideWord)}\\b`, 'i');
    if (!near.test(reason)) problems.push(`the ${sideWord} and ${line} not said together`);
    if (side === 'over' || side === 'under') {
      const other = side === 'over' ? 'under' : 'over';
      if (new RegExp(`\\b${other}\\s+${lineRe}(?![\\d.]\\d)`, 'i').test(reason)) problems.push(`the other side said: ${other} ${line}`);
    }
  }
  // 7. format
  if (/[*_#`]|^\s*[-•]/m.test(t) || /["“”]/.test(t)) problems.push('formatting or quotation marks');
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) problems.push('emoji');
  if (/undefined|NaN|null|\[object/.test(String(text))) problems.push('a missing value printed');
  return problems;
}

// ---------------------------------------------------------------------------------------------------------
// Applying a stored write-up to a pick

// A pick's text from its stored entry (writeups.json items[id]): the AI's where it's ok for the bet's current
// hash, else the plain one; reason never left empty
export function applyWriteups(pick, entry, hash = entry?.plain?.hash) {
  const ai = entry?.ai;
  if (ai && ai.status === 'ok' && ai.hash === hash && typeof ai.reason === 'string' && ai.reason) {
    pick.reason = ai.reason;
    if (ai.risk) pick.risk = ai.risk;
    if (ai.headline) pick.headline = ai.headline;
    if (ai.stance) pick.read = ai.stance;
    pick.by = 'claude';
    return pick;
  }
  const plain = entry?.plain;
  if (plain && typeof plain.reason === 'string' && plain.reason) {
    pick.reason = plain.reason;
    if (plain.risk) pick.risk = plain.risk;
    // (the old one-liner a failed write-up fell back to: said so, never taken for the plain text)
    pick.by = plain.legacy ? 'legacy' : 'plain';
  }
  return pick;
}

// A bet's plain write-up, frozen per its hash: the stored one when its hash and PLAIN_V match, else written
// now (and stored, where a store is given: writeups.items). The fit params a prop without its own (projection
// .applied) is written with are frozen with it, so a refit never moves its drivers. Returns { hash, entry }
export function plainFor(bet, { game = null, sib = null, state = null, ledger = null, writeups = null } = {}) {
  const hash = hashOf(bet, sib);
  const was = writeups?.items?.[bet.id] ?? null;
  if (was?.plain?.hash === hash && was.plain.v === PLAIN_V && was.plain.reason) return { hash, entry: was };
  const frozen = was?.plain?.hash === hash ? was.plain.params : undefined;
  const params = bet.market === 'prop' && !bet.projection?.applied ? (frozen ?? propParamsOf(state, bet.propType, firstCtxKeyOf(bet))) : null;
  const sheet = factsOf(bet, { game, sib, state, ledger, params });
  const { reason, risk } = plainOf(sheet);
  const plain = { hash, v: PLAIN_V, reason, risk, ...(params ? { params } : {}) };
  const entry = { ...(was ?? {}), plain };
  if (writeups) {
    writeups.items ??= {};
    writeups.items[bet.id] = entry;
  }
  return { hash, entry };
}

// (a prop type's fit params, the ones a projection's drivers need: its scale, its weights on recent form, the
// opponent and the game script, and its context terms' sizes. The state keeps the first term's size as a
// plain c (project.mjs ctxFactor): it's that term's, ctxKey (the bet's first ctx key), as props.mjs's applied)
export function propParamsOf(state, propType, ctxKey = null) {
  const p = (state?.props?.types ?? []).find((t) => t.key === propType)?.params;
  if (!p) return null;
  const out = Object.fromEntries(Object.entries(p).filter(([k, v]) => (['scale', 'w', 'a', 'b'].includes(k) || /^c_/.test(k)) && fin(v)));
  if (ctxKey && fin(p.c) && !fin(out[`c_${ctxKey}`])) out[`c_${ctxKey}`] = p.c;
  return out;
}

// (a prop's first context term: its projection's ctx keys are in its type's order, props.mjs)
export const firstCtxKeyOf = (bet) => {
  const ctx = bet?.projection?.ctx;
  return ctx && typeof ctx === 'object' ? (Object.keys(ctx)[0] ?? null) : null;
};
