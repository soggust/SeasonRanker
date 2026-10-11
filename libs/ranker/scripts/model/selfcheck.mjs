// The desk's weekly self-check: free, no AI, no network. Once a week (the Model Desk - Self-check workflow,
// Monday morning Central) each sport's ledger, CHECKs, state and the state's history in git are read and put
// through the checks below, each a pure function of what's read (selfCheck), and the result written to
// apps/<sport>/src/StaticData/model/selfcheck.json, which the Algorithm tab shows (flags first). It never
// changes the desk: it says where to look.
//
//   window    the week: the bets graded (gradedAt) in the 7 days before it runs; the placement checks (C2, C4,
//             C5, C8, C14) the bets placed (placedAt) in them. The baseline: the 28 days before the week. The
//             28-day checks (C7, C10, C11): the 28 days up to it
//   weights   a bet counts w = bet.weight (1; 0.3 when its premise broke in the game: postmortem.mjs); pushes
//             and voids out. Expected wins E = sum of w x p (the desk's chance), z = (W - E) / sqrt(sum of
//             w x p(1 - p)), ROI the profit over the units staked
//   statuses  flag (look now), watch, partial (a bot field it needs is missing: named in needs), ok, thin (too
//             few bets to say; never ok), info (a report, nothing to judge)
//   checks    C1  inputs changed after placement: a game bet's book moved away from its side after it was
//                 placed (seen: its fair chance 3 points or more, or its line a point (NFL, NBA) or half (NHL,
//                 MLB)), a prop's close half a point against it; the changed group's record and CLV (the
//                 injury and starter hashes at the start, inputsAtStart, when the bot keeps them: partial till)
//             C2  the line already moving against the side when it was bet (a prop's open to now a point; a
//                 game's spread 1.5 (NFL) or 0.5, its total a point, a moneyline without a spread move 3 points
//                 of the home chance): their ROI against the rest; a prop placed with its line moved twice the
//                 guard's limit (props.mjs: max(1, 12% of the line)) a guard bug
//             C3  the market moving away after the bet, the bot not: per prop type, the share whose close moved
//                 a point against it or whose CLV lost 2 points or more; the beat rate; the 5 biggest moves
//             C4  over/under drift: per prop type and side, the share of the week's props, the record against
//                 the expected wins, the ROI, the projection's miss (mean - actual) beside the fit's own bias
//             C5  favorite/dog drift: per market, the dogs' share (a plus price, or a spread side getting
//                 points) this week against the baseline's; the dogs' and favorites' records
//             C6  CLV by bet type: per market and prop type, the beat rate and the mean CLV (prob and ev), the
//                 week against the baseline and against the last self-check's (two weeks running: the file's
//                 prevC6, the one 5 days back or more, so a run again within the week compares the same)
//             C7  loss clusters: the 28 days' graded bets by team, opponent, player, home or away, role depth,
//                 the vacated term, teammates out or questionable, back-to-backs, a backup QB, the weather, the
//                 lead time, the start hour (ET), where the prices came from, the band, the guard, the
//                 disruption: z per cell of 8 or more, flagged only at z -3 (watch -2.5) as many are tested
//             C8  the guards: the share of placed bets cut by each kind of guard, this week against the
//                 baseline (the skips the bot doesn't keep yet: partial till state.tallies)
//             C9  the fit's terms, params and trust from the state's history (git: the day's last state.json
//                 for 35 days): a context term dropped (flagged where it was kept 3 weeks of the 4 before), its
//                 sign flipped or size moved half; a prop type's optional terms gone; a market's trust gone to
//                 0 or unfitted (a fitted one: the untested start's 0.5 to a first fit isn't a drop); the
//                 week's changelog verbatim
//             C10 all-player and selection bias: each prop type's all-player bias against its error (the fit's
//                 check); the bets' own miss by side and role depth against it
//             C11 band calibration: each published band's record against the chance it was published at; the
//                 prop fits' calibration rows off by 7 points or more
//             C12 disruption: the share of graded bets whose premise broke (weight under 1), by kind
//             C13 the open book and the pipeline: open bets now past the gap or published at another band than
//                 today's trust gives them, open bets past their start plus VOID_AFTER, graded bets with no close
//             C14 data holes: the share of the week's bets missing a field the desk relies on, against the
//                 baseline's; a fair chance from somewhere unknown
//             C15 write-ups: the plain write-ups' count and length, the Claude analyses' status, the AI usage
//                 log's calls, failures and spend against the caps (ai-budget.mjs), 3 of the week's Claude
//                 analyses to read in full
//             C16 ops: the model files' age with bets overdue to grade, The Odds API's credits, the sources not
//                 ok, no bets in a week with games
//             C17 the CHECKs' causes (state.json's checks.learning, check-learn.mjs): each cause's hit rate
//                 against its break-even and the ranked advice (a confirmed blind spot a flag)
//             C18 the owner's notes on CHECKs by reason (checkSummary's byReason): each reason's record
//   output    { v, sport, at, window, baseline, summary: { flag, watch, ..., headline }, checks: [...], writeups,
//             notes, prevC6 (the CLV rows C6 compares with next week) }: each check { id, title, status, headline, metric, value, threshold, n, rows, examples,
//             how, needs, tested }, every number in a headline from its rows; keys sorted and numbers rounded to
//             4 places, written only when something but `at` changed (writeIfChanged)
//   CLI       node libs/ranker/scripts/model/selfcheck.mjs [sport ...] [--dry] [--now <ISO>]: every sport with
//             a ledger; --dry prints the summary and writes nothing. A sport that fails is warned of and
//             skipped, never the others; a check that throws is reported partial with its error

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_CAP, MONTH_CAP } from './ai-budget.mjs';
import { MIN_N } from './check-learn.mjs';
import { VOID_AFTER, chanceAt, intentOf, pastGap } from './desk.mjs';
import { levelOf, scoreParts } from './picks.mjs';
import { round } from './ratings.mjs';

export const SELFCHECK_V = 1;
export const STATUSES = ['flag', 'watch', 'partial', 'ok', 'thin', 'info'];
const DAY = 864e5;
export const WEEK_DAYS = 7;
export const BASE_DAYS = 28;
// (the planned cost of one Claude write-up, the spec's: a mean over 1.3x it a watch, 1.5x a flag)
export const WRITEUP_PLAN = 0.071;
// (the cells a many-cell check lists: the worst)
export const WORST = 5;
// (the fair chances' known sources: run.mjs fairFrom)
export const KNOWN_FAIR = new Set(['pinnacle', 'its own prices']);
export const BAND_LABELS = { lock: 'LOCK', high: 'LOVE', medium: 'LIKE', low: 'PASS' };

export const TITLES = {
  C1: 'Inputs changed after placement',
  C2: 'Line already moving against at placement',
  C3: "Market moved after the bet, the bot didn't",
  C4: 'Over/under drift by stat',
  C5: 'Favorite/dog drift',
  C6: 'CLV by bet type',
  C7: 'Loss clusters',
  C8: 'Guards cutting unusually often',
  C9: 'Fitted terms, params and trust',
  C10: 'All-player and selection bias',
  C11: 'Band calibration',
  C12: 'Disruption',
  C13: 'Stale open book and pipeline',
  C14: 'Data holes',
  C15: 'Write-ups health',
  C16: 'Ops',
  C17: 'CHECK causes and advice',
  C18: "Owner's notes by reason",
};

// ---- helpers ----

const fin = Number.isFinite;
const r4 = (v) => (fin(v) ? round(v, 4) : null);
const ms = (iso) => Date.parse(iso ?? '');
const inSpan = (iso, span) => {
  const t = ms(iso);
  return t >= span.from && t < span.to;
};
const pct = (v, d = 0) => (fin(v) ? `${(v * 100).toFixed(d)}%` : '-');
const sgn = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}` : '-');
// (a record against its expectation as the headlines say it: 37 won vs 51.8 expected (z -2.84))
const recOf = (t) => `${fin(t.w) ? round(t.w, 1) : 0} won vs ${fin(t.e) ? round(t.e, 1) : 0} expected${fin(t.z) ? ` (z ${round(t.z, 2)})` : ''}`;
const count = (list, f) => list.reduce((n, x) => n + (f(x) ? 1 : 0), 0);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// (a bet graded won or lost: pushes and voids out of the records)
export const settledOf = (b) => (b?.status === 'won' || b?.status === 'lost') && !b.void;
export const weightOf = (b) => (fin(b?.weight) ? b.weight : 1);
// (a bet's market key: a prop's by its type)
export const keyOf = (b) => (b.market === 'prop' ? `prop:${b.propType}` : b.market);

// The record of a list against its expected wins: n settled, W (weighted wins), E (weighted chances), z, the
// ROI (profit over units staked) and the profit; pOf the chance each was taken at (the desk's p by default)
export function zOf(list, pOf = (b) => b.p) {
  let W = 0;
  let E = 0;
  let V = 0;
  let profit = 0;
  let staked = 0;
  let n = 0;
  for (const b of list) {
    const p = pOf(b);
    if (!settledOf(b) || !fin(p)) continue;
    const w = weightOf(b);
    n++;
    W += b.status === 'won' ? w : 0;
    E += w * p;
    V += w * p * (1 - p);
    profit += fin(b.profit) ? b.profit : 0;
    staked += fin(b.units) ? b.units : 0;
  }
  return { n, w: r4(W), e: r4(E), z: V > 0 ? r4((W - E) / Math.sqrt(V)) : null, roi: staked > 0 ? r4(profit / staked) : null, profit: r4(profit) };
}

// Points a line moved against a side, from one number to another (positive: against). A spread's line is the
// side's own: more points for it is the market moving away from it; an over's line dropping, an under's rising
export function againstPts(market, side, from, to) {
  if (!fin(from) || !fin(to)) return null;
  if (market === 'spread') return to - from;
  if (side === 'over') return from - to;
  if (side === 'under') return to - from;
  return null;
}

// A game bet's opening move against its side at placement (context.move: the home spread's points, the total's,
// the home moneyline chance): { pts, limit } or null. The spread and the moneyline by the spread's move (the
// home line down is the market toward home), a moneyline whose spread didn't move by its own (3 points of the
// home chance); a total by the total's
export function gameMoveOf(b, sport) {
  const m = b.context?.move;
  if (!m) return null;
  const home = b.side === 'home' ? 1 : b.side === 'away' ? -1 : 0;
  if (b.market === 'total') {
    if (!fin(m.total)) return null;
    return { pts: b.side === 'over' ? -m.total : b.side === 'under' ? m.total : 0, limit: 1 };
  }
  if (!home) return null;
  if (fin(m.spread) && m.spread !== 0) return { pts: home * m.spread, limit: sport === 'nfl' ? 1.5 : 0.5 };
  if (b.market === 'ml' && fin(m.ml)) return { pts: -home * m.ml, limit: 0.03 };
  return fin(m.spread) ? { pts: 0, limit: sport === 'nfl' ? 1.5 : 0.5 } : null;
}

// (a guard's kind from its words: the line's move, a questionable player, a starter not confirmed, a lineup;
// else its words before the first parenthesis, numbers out)
export function guardKind(why) {
  const t = String(why ?? '');
  if (/line moved/i.test(t)) return 'line moved';
  if (/questionable/i.test(t)) return 'questionable';
  if (/not confirmed|not announced/i.test(t)) return 'starter not confirmed';
  if (/lineup/i.test(t)) return 'lineup';
  if (/last chance before the news/i.test(t)) return 'news pending';
  if (/forecast/i.test(t)) return 'forecast';
  return t.split('(')[0].replace(/[+-]?\d+(\.\d+)?/g, '').replace(/\s+/g, ' ').trim().toLowerCase() || 'other';
}

// The worst status of several (flag over watch over partial over ok over thin over info)
const RANK = { flag: 0, watch: 1, partial: 2, ok: 3, thin: 4, info: 5 };
export const worst = (...ss) => ss.filter(Boolean).sort((a, b) => RANK[a] - RANK[b])[0] ?? 'ok';

// A check's object, every field there (null where it has none)
function check(id, f) {
  return {
    id,
    title: TITLES[id],
    status: f.status,
    headline: f.headline ?? '',
    metric: f.metric ?? null,
    value: r4(f.value),
    threshold: f.threshold ?? null,
    n: fin(f.n) ? f.n : null,
    rows: f.rows ?? [],
    examples: (f.examples ?? []).slice(0, WORST),
    how: f.how ?? '',
    needs: f.needs?.length ? f.needs : null,
    tested: fin(f.tested) ? f.tested : null,
  };
}

// (an ok status with a field missing: partial; a watch or flag stands, the missing field named beside it)
const partialIf = (status, needs) => (needs?.length && status === 'ok' ? 'partial' : status);

// ---- the checks (each takes the context: { sport, now, week, base, recent, bets, checks, state, snaps, prev,
// ledgerAt, gamesInWindow, writeups, aiLog, teams }) ----

// C1: inputs changed after placement
export function c1(x) {
  const step = x.sport === 'nfl' || x.sport === 'nba' ? 1 : 0.5;
  const graded = x.bets.filter((b) => settledOf(b) && inSpan(b.gradedAt, x.week));
  const games = graded.filter((b) => b.market !== 'prop' && b.seen);
  const props = graded.filter((b) => b.market === 'prop' && fin(b.close?.line));
  const gameChanged = (b) => (fin(b.seen.fair) && fin(b.fair) && b.seen.fair - b.fair <= -0.03) || (b.market !== 'ml' && (againstPts(b.market, b.side, b.line, b.seen.line) ?? 0) >= step);
  const propChanged = (b) => (againstPts('prop', b.side, b.line, b.close.line) ?? 0) >= 0.5;
  const changed = [...games.filter(gameChanged), ...props.filter(propChanged)];
  const rest = [...games.filter((b) => !gameChanged(b)), ...props.filter((b) => !propChanged(b))];
  const n = games.length + props.length;
  const share = n ? changed.length / n : null;
  const zc = zOf(changed);
  const clvEv = mean(changed.map((b) => b.clv?.ev).filter(fin));
  // (the injury and starter hashes at the start against the ones it was placed with, where the bot keeps both)
  const withStart = graded.filter((b) => b.inputs && b.inputsAtStart);
  const silent = withStart.filter((b) => Object.entries(b.inputsAtStart).some(([k, h]) => h !== null && b.inputs[k] !== undefined && b.inputs[k] !== h) && !b.repriced);
  const needs = withStart.length ? [] : ['inputsAtStart (the injury and starter hashes as the game started)'];
  let status = n < 15 ? 'thin' : 'ok';
  if (n >= 15 && share >= 0.3) status = 'watch';
  if ((n >= 15 && share >= 0.4) || (zc.n >= 20 && fin(zc.z) && zc.z <= -2)) status = 'flag';
  const rows = [
    { key: 'games', n: games.length, changed: count(games, gameChanged), share: r4(games.length ? count(games, gameChanged) / games.length : null) },
    { key: 'props', n: props.length, changed: count(props, propChanged), share: r4(props.length ? count(props, propChanged) / props.length : null) },
    { key: 'changed', ...zc, clvEv: r4(clvEv) },
    { key: 'unchanged', ...zOf(rest) },
    ...(withStart.length ? [{ key: 'inputs changed, not priced again', n: withStart.length, changed: silent.length, share: r4(silent.length / withStart.length) }] : []),
  ];
  return check('C1', {
    status: partialIf(status, needs),
    headline: n ? `${changed.length} of ${n} graded bets (${pct(share)}) saw the book move against them after placement; they went ${recOf(zc)}` : 'No graded bets with a later price this week',
    metric: 'share',
    value: share,
    threshold: 'watch 30% (15+ bets), flag 40% or the changed group z -2 (20+)',
    n,
    rows,
    examples: changed.sort((a, b) => (a.clv?.ev ?? 0) - (b.clv?.ev ?? 0)).map((b) => b.id),
    how: `graded this week: a game bet whose later fair chance fell 3 points or more, or its line moved ${step} against it; a prop whose close moved half a point against it`,
    needs,
  });
}

// C2: the line already moving against the side when it was bet
export function c2(x) {
  const placed = x.bets.filter((b) => inSpan(b.placedAt, x.week));
  const moving = [];
  const bugs = [];
  for (const b of placed) {
    if (b.market === 'prop') {
      const m = b.context?.move;
      if (!m || !fin(m.open) || !fin(m.now)) continue;
      if ((againstPts('prop', b.side, m.open, m.now) ?? 0) >= 1) moving.push(b);
      const limit = Math.max(1, 0.12 * (fin(b.line) ? b.line : m.now));
      if (Math.abs(m.now - m.open) >= 2 * limit) bugs.push(b);
    } else {
      const g = gameMoveOf(b, x.sport);
      if (g && g.pts >= g.limit) moving.push(b);
    }
  }
  const ids = new Set(moving.map((b) => b.id));
  const zm = zOf(moving);
  const zr = zOf(placed.filter((b) => !ids.has(b.id)));
  const gap = fin(zm.roi) && fin(zr.roi) ? zr.roi - zm.roi : null;
  let status = zm.n < 15 ? 'thin' : 'ok';
  if (zm.n >= 15 && gap >= 0.1) status = 'watch';
  if (zm.n >= 15 && gap >= 0.1 && zm.roi <= -0.15) status = 'flag';
  if (bugs.length) status = 'flag';
  return check('C2', {
    status,
    headline: `${moving.length} of ${placed.length} bets placed this week had the line already moving against them${zm.n ? `: ROI ${pct(zm.roi, 1)} against ${pct(zr.roi, 1)} for the rest` : ''}${bugs.length ? `; ${bugs.length} props placed past twice the guard's limit (a guard bug)` : ''}`,
    metric: 'roiGap',
    value: gap,
    threshold: 'watch an ROI gap of 10 points (15+ graded), flag also their ROI -15% or any guard bug',
    n: placed.length,
    rows: [
      { key: 'moving against', placed: moving.length, ...zm },
      { key: 'the rest', placed: placed.length - moving.length, ...zr },
      { key: 'guard bugs', n: bugs.length },
    ],
    examples: (bugs.length ? bugs : moving).map((b) => b.id),
    how: "placed this week: a prop's line a point or more against its side since it opened; a game's spread 1.5 (NFL) or 0.5, its total a point, a moneyline without a spread move 3 points of the home chance. A prop moved twice the guard's limit should have been skipped",
  });
}

// C3: the market moving away after the bet while the bot stood still
export function c3(x) {
  const props = x.bets.filter((b) => b.market === 'prop' && settledOf(b) && inSpan(b.gradedAt, x.week) && (b.close || b.clv));
  const movedOf = (b) => (againstPts('prop', b.side, b.line, b.close?.line) ?? 0) >= 1 || (b.clv?.beat === false && Math.abs(b.clv?.prob ?? 0) >= 0.02);
  const tallyOf = (list) => {
    const beats = list.map((b) => b.clv?.beat).filter((v) => v === true || v === false);
    return { n: list.length, moved: count(list, movedOf), share: r4(list.length ? count(list, movedOf) / list.length : null), beat: r4(beats.length ? count(beats, (v) => v) / beats.length : null), ev: r4(mean(list.map((b) => b.clv?.ev).filter(fin))) };
  };
  const all = tallyOf(props);
  const types = [...new Set(props.map((b) => b.propType))].sort().map((t) => ({ key: `prop:${t}`, label: props.find((b) => b.propType === t).statLabel ?? t, ...tallyOf(props.filter((b) => b.propType === t)) }));
  let status = all.n < 25 ? 'thin' : 'ok';
  if (all.n >= 25 && all.share >= 0.45) status = 'watch';
  if (all.n >= 25 && (all.share >= 0.55 || (fin(all.beat) && all.beat < 0.42))) status = 'flag';
  const biggest = props
    .map((b) => ({ b, pts: againstPts('prop', b.side, b.line, b.close?.line) ?? 0 }))
    .filter((m) => m.pts > 0)
    .sort((a, b) => b.pts - a.pts || a.b.id.localeCompare(b.b.id));
  return check('C3', {
    status,
    headline: all.n ? `${all.moved} of ${all.n} graded props (${pct(all.share)}) saw the market move away after the bet; beat the close ${pct(all.beat)}` : 'No graded props with a close this week',
    metric: 'share',
    value: all.share,
    threshold: 'watch 45% (25+ props), flag 55% or a beat rate under 42%',
    n: all.n,
    rows: [{ key: 'all', label: 'All props', ...all }, ...types.sort((a, b) => (b.share ?? 0) - (a.share ?? 0))],
    examples: biggest.map((m) => m.b.id),
    how: 'graded props this week: the close a point or more against the side, or the CLV lost (2 points of chance or more); per prop type',
  });
}

// C4: over/under drift by stat
export function c4(x) {
  const placed = x.bets.filter((b) => b.market === 'prop' && inSpan(b.placedAt, x.week));
  const types = Object.fromEntries((x.state?.props?.types ?? []).map((t) => [t.key, t]));
  const cells = [];
  for (const t of [...new Set(placed.map((b) => b.propType))].sort()) {
    const ofType = placed.filter((b) => b.propType === t);
    for (const side of ['over', 'under']) {
      const list = ofType.filter((b) => b.side === side);
      if (!list.length) continue;
      const z = zOf(list);
      const miss = mean(list.filter((b) => settledOf(b) && fin(b.actual) && fin(b.projection?.mean)).map((b) => b.projection.mean - b.actual));
      const share = list.length / ofType.length;
      let status = 'ok';
      if (ofType.length >= 20 && share >= 0.75) status = 'watch';
      if (z.n >= 10 && fin(z.z) && z.z <= -2) status = 'watch';
      if ((z.n >= 30 && fin(z.z) && z.z <= -2.5) || (ofType.length >= 20 && share >= 0.75 && z.n >= 10 && fin(z.roi) && z.roi <= -0.1)) status = 'flag';
      cells.push({ key: `${t}:${side}`, label: `${list[0].statLabel ?? t} ${side === 'over' ? 'Over' : 'Under'}`, status, placed: list.length, share: r4(share), ...z, bias: r4(miss), fitBias: r4(types[t]?.check?.bias), allBias: r4(types[t]?.allPlayersBias) });
    }
  }
  cells.sort((a, b) => RANK[a.status] - RANK[b.status] || (a.z ?? 0) - (b.z ?? 0) || a.key.localeCompare(b.key));
  const top = cells[0];
  const status = !placed.length ? 'thin' : worst(...cells.map((c) => c.status));
  return check('C4', {
    status,
    headline: top ? `${top.label}: ${recOf(top)}, ${pct(top.share)} of its stat's props${fin(top.roi) ? `, ROI ${pct(top.roi, 1)}` : ''}` : 'No props placed this week',
    metric: 'z',
    value: top?.z ?? null,
    threshold: 'watch one side 75% of a stat (20+) or a side z -2 (10+ graded); flag z -2.5 (30+) or one-sided at ROI -10% (10+ graded)',
    n: placed.length,
    rows: cells.slice(0, WORST * 2),
    tested: cells.length,
    how: "props placed this week, by type and side: the share, the record against the expected wins, the ROI, the projection's miss (mean - actual) beside the fit's bias and the all-player bias",
  });
}

// (a dog: a plus price, or a spread side getting points)
export const isDog = (b) => b.odds > 0 || (b.market === 'spread' && fin(b.line) && b.line > 0);

// C5: favorite/dog drift
export function c5(x) {
  const rows = [];
  for (const market of ['spread', 'ml', 'prop']) {
    const now = x.bets.filter((b) => b.market === market && inSpan(b.placedAt, x.week));
    const then = x.bets.filter((b) => b.market === market && inSpan(b.placedAt, x.base));
    if (!now.length) continue;
    const shareNow = count(now, isDog) / now.length;
    const shareThen = then.length ? count(then, isDog) / then.length : null;
    const dogs = zOf(now.filter(isDog));
    const favs = zOf(now.filter((b) => !isDog(b)));
    const moved = fin(shareThen) ? shareNow - shareThen : null;
    const grew = moved > 0 ? dogs : favs;
    let status = now.length >= 20 && then.length >= 20 ? 'ok' : 'thin';
    if (status === 'ok' && Math.abs(moved) >= 0.2) status = grew.n >= 30 && fin(grew.z) && grew.z <= -2 ? 'flag' : 'watch';
    rows.push({ key: market, status, n: now.length, nBase: then.length, dogShare: r4(shareNow), dogShareBase: r4(shareThen), moved: r4(moved), dogs, favorites: favs });
  }
  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || Math.abs(b.moved ?? 0) - Math.abs(a.moved ?? 0));
  const top = rows[0];
  return check('C5', {
    status: rows.length ? worst(...rows.map((r) => r.status)) : 'thin',
    headline: top ? `${top.key === 'ml' ? 'Moneyline' : top.key === 'prop' ? 'Props' : 'Spread'}: dogs ${pct(top.dogShare)} of this week's bets${fin(top.dogShareBase) ? ` against ${pct(top.dogShareBase)} before` : ''}` : 'No spread, moneyline or prop bets this week',
    metric: 'moved',
    value: top?.moved ?? null,
    threshold: 'watch the dog share moved 20 points (20+ bets both); flag also the grown group z -2 (30+ graded)',
    n: rows.reduce((t, r) => t + r.n, 0),
    rows,
    how: 'placed this week against the 28 days before: a dog is a plus price or a spread side getting points',
  });
}

// (the CLV of a list: n with a CLV, the beat rate, the mean chance and return at the close)
function clvOf(list) {
  const has = list.filter((b) => b.clv);
  const beats = has.map((b) => b.clv.beat).filter((v) => v === true || v === false);
  return { n: has.length, beat: r4(beats.length ? count(beats, (v) => v) / beats.length : null), prob: r4(mean(has.map((b) => b.clv.prob).filter(fin))), ev: r4(mean(has.map((b) => b.clv.ev).filter(fin))) };
}

// C6: CLV by bet type
export function c6(x) {
  const week = x.bets.filter((b) => settledOf(b) && inSpan(b.gradedAt, x.week));
  const base = x.bets.filter((b) => settledOf(b) && inSpan(b.gradedAt, x.base));
  const prevRows = Object.fromEntries((x.prevC6?.rows ?? []).map((r) => [r.key, r]));
  const rows = [];
  for (const key of [...new Set(week.map(keyOf))].sort()) {
    const now = clvOf(week.filter((b) => keyOf(b) === key));
    if (!now.n) continue;
    const then = clvOf(base.filter((b) => keyOf(b) === key));
    const last = prevRows[key] ?? null;
    let status = now.n >= 20 ? 'ok' : 'thin';
    // (the return at the close carries the vig: a flat close at -110 is about -4.5%, so only worse than -6% counts)
    if (now.n >= 20 && ((fin(now.beat) && now.beat < 0.47) || (fin(now.ev) && now.ev <= -0.06))) status = 'watch';
    if ((now.n >= 25 && fin(now.beat) && now.beat < 0.44) || (now.n >= 20 && fin(now.prob) && now.prob < -0.01 && fin(last?.prob) && last.prob < -0.01)) status = 'flag';
    rows.push({ key, status, ...now, base: then, lastWeek: last ? { n: last.n ?? null, beat: last.beat ?? null, prob: last.prob ?? null, ev: last.ev ?? null } : null });
  }
  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || (a.beat ?? 1) - (b.beat ?? 1));
  const all = clvOf(week);
  const top = rows[0];
  return check('C6', {
    status: rows.length ? worst(...rows.map((r) => r.status)) : 'thin',
    headline: top ? `${top.key.replace(/^prop:/, '')}: beat the close ${pct(top.beat)} of ${top.n}${fin(top.prob) ? `, mean CLV ${sgn(top.prob * 100, 1)} points` : ''}; all bets ${pct(all.beat)} of ${all.n}` : 'No graded bets with a close this week',
    metric: 'beat',
    value: top?.beat ?? null,
    threshold: 'watch beat under 47% or mean return at the close -6% (20+); flag beat under 44% (25+) or mean CLV under -1 point two weeks running',
    n: all.n,
    rows,
    how: 'graded this week by market and prop type, against the 28 days before and the last self-check; the return at the close counts the vig, so -4.5% is a flat close at -110',
  });
}

// (the role's depth as the cells name it: WR1, RB2+)
const hourET = (iso) => {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));
  } catch {
    return null;
  }
};

// A bet's cells for the loss clusters: [dimension, value]
export function cellsOf(b, teams = {}) {
  const cells = [['market', keyOf(b)]];
  const [away, home] = String(b.matchup ?? '').split(' @ ').map((s) => s.trim());
  let team = null;
  let where = null;
  if (b.market === 'prop') {
    const abbr = teams[String(b.team)] ?? null;
    if (abbr && (abbr === home || abbr === away)) {
      team = abbr;
      where = abbr === home ? 'home' : 'away';
    }
  } else if (b.side === 'home' || b.side === 'away') {
    where = b.side;
    team = where === 'home' ? home : away;
  }
  if (team) {
    cells.push(['team', team], ['opponent', team === home ? away : home], ['home/away', where]);
  }
  if (b.market === 'prop') {
    if (b.player) cells.push(['player', b.player]);
    const p = b.projection ?? {};
    if (p.role) cells.push(['role', p.role]);
    if (fin(p.vacF)) cells.push(['vacated', p.vacF < 0.97 ? 'under 0.97' : p.vacF > 1.03 ? 'over 1.03' : 'about 1']);
    cells.push(['teammates out', p.out?.length ? 'some' : 'none'], ['teammates questionable', p.questionable?.length ? 'some' : 'none']);
    cells.push(['price', b.oddsAssumed ? 'assumed -110' : 'the book']);
    if (b.pricesFrom) cells.push(['prices from', b.pricesFrom]);
  } else {
    const c = b.context ?? {};
    if (Array.isArray(c.b2b)) cells.push(['back-to-back', c.b2b.some((v) => v) ? 'yes' : 'no']);
    if (backupIn(c)) cells.push(['backup QB', 'in the game']);
    const w = c.weather;
    if (w && (fin(w.wind) || fin(w.precip) || w.snow)) cells.push(['weather', w.snow ? 'snow' : (w.wind ?? 0) >= 15 ? 'wind 15+' : (w.precip ?? 0) >= 0.1 ? 'rain' : 'fair']);
    cells.push(['fair from', b.fairFrom ?? 'unknown']);
  }
  const lead = (ms(b.start) - ms(b.placedAt)) / 36e5;
  if (fin(lead)) cells.push(['lead time', lead < 3 ? 'under 3h' : lead < 12 ? '3-12h' : lead < 30 ? '12-30h' : 'over 30h']);
  const h = hourET(b.start);
  if (fin(h)) cells.push(['start (ET)', h < 13 ? 'before 1pm' : h < 16 ? '1-4pm' : h < 19 ? '4-7pm' : '7pm on']);
  cells.push(['band', BAND_LABELS[b.publishedLevel] ?? 'not published']);
  cells.push(['intent', intentOf(b)]);
  cells.push(['guard', b.context?.guard ? guardKind(b.context.guard) : b.context?.oneSide ? 'one side' : 'none']);
  const broke = (b.disrupted ?? []).find((d) => d.severe) ?? (b.disrupted ?? [])[0];
  cells.push(['disrupted', broke?.kind ?? 'no']);
  return cells;
}
// (a backup quarterback starting for either side: the game's context, football.mjs's starters)
const backupIn = (c) => Array.isArray(c.starters?.backup) && c.starters.backup.some((v) => v);

// C7: loss clusters
export function c7(x) {
  const graded = x.bets.filter((b) => settledOf(b) && inSpan(b.gradedAt, x.recent));
  const groups = new Map();
  for (const b of graded) {
    for (const [dim, v] of cellsOf(b, x.teams)) {
      const k = `${dim}: ${v}`;
      if (!groups.has(k)) groups.set(k, { dim, value: String(v), bets: [] });
      groups.get(k).bets.push(b);
    }
  }
  const cells = [];
  for (const [key, g] of groups) {
    if (g.bets.length < 8) continue;
    const z = zOf(g.bets);
    if (!fin(z.z)) continue;
    cells.push({ key, dim: g.dim, value: g.value, ...z, status: z.z <= -3 ? 'flag' : z.z <= -2.5 ? 'watch' : 'ok', ids: g.bets.filter((b) => b.status === 'lost').map((b) => b.id) });
  }
  cells.sort((a, b) => a.z - b.z || a.key.localeCompare(b.key));
  const top = cells[0];
  return check('C7', {
    status: graded.length < 30 ? (cells.some((c) => c.status === 'flag') ? 'flag' : 'thin') : cells.length ? worst(...cells.map((c) => c.status)) : 'ok',
    headline: top ? `Worst cell ${top.key}: ${recOf(top)} on ${top.n} bets, ROI ${pct(top.roi, 1)}` : 'No cell with 8 graded bets in the 28 days',
    metric: 'z',
    value: top?.z ?? null,
    threshold: 'many cells tested: watch z -2.5, flag z -3 (cells of 8+)',
    n: graded.length,
    rows: cells.slice(0, WORST).map(({ ids: _ids, ...c }) => c),
    examples: top?.ids ?? [],
    tested: cells.length,
    how: 'graded in the 28 days, by team, opponent, player, home or away, role depth, the vacated term, teammates out or questionable, back-to-backs, a backup QB, the weather, the lead time, the start hour, the prices, the band, the guard and the disruption',
  });
}

// C8: the guards cutting unusually often
export function c8(x) {
  const now = x.bets.filter((b) => inSpan(b.placedAt, x.week));
  const then = x.bets.filter((b) => inSpan(b.placedAt, x.base));
  const kinds = (list) => {
    const out = {};
    for (const b of list) if (b.context?.guard) out[guardKind(b.context.guard)] = (out[guardKind(b.context.guard)] ?? 0) + 1;
    return out;
  };
  const kNow = kinds(now);
  const kThen = kinds(then);
  const rows = [];
  for (const kind of [...new Set([...Object.keys(kNow), ...Object.keys(kThen)])].sort()) {
    const n = kNow[kind] ?? 0;
    const share = now.length ? n / now.length : 0;
    const shareBase = then.length ? (kThen[kind] ?? 0) / then.length : null;
    let status = 'ok';
    const ratio = shareBase > 0 ? share / shareBase : null;
    if (n >= 10 && (ratio === null ? !!then.length : ratio >= 2)) status = 'watch';
    if ((n >= 10 && ratio >= 3 && share >= 0.25) || (shareBase === 0 && n >= 20)) status = 'flag';
    rows.push({ key: kind, status, n, share: r4(share), shareBase: r4(shareBase), ratio: r4(ratio) });
  }
  // (the skips and holds, where the bot keeps its day's tallies: state.tallies[day] { placed, skipped, held })
  const tallies = x.state?.tallies && typeof x.state.tallies === 'object' ? x.state.tallies : null;
  if (tallies) {
    const days = Object.entries(tallies).filter(([d]) => inSpan(`${d}T12:00:00Z`, x.week));
    const skipped = {};
    let placedN = 0;
    for (const [, t] of days) {
      placedN += t?.placed ?? 0;
      for (const [k, v] of Object.entries(t?.skipped ?? {})) skipped[k] = (skipped[k] ?? 0) + (v ?? 0);
    }
    for (const [k, v] of Object.entries(skipped).sort()) rows.push({ key: `skipped: ${k}`, status: 'ok', n: v, share: r4(placedN + v ? v / (placedN + v) : null), shareBase: null, ratio: null });
  }
  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || b.n - a.n);
  const needs = tallies ? [] : ['state.tallies (the guards\' skips by day: the bot keeps only the bets it placed)'];
  const top = rows[0];
  const status = now.length < 10 ? 'thin' : rows.length ? worst(...rows.map((r) => r.status)) : 'ok';
  return check('C8', {
    status: partialIf(status, needs),
    headline: top ? `${top.key}: ${top.n} of ${now.length} bets placed this week (${pct(top.share)})${fin(top.shareBase) ? ` against ${pct(top.shareBase)} before` : ''}` : `No bet placed this week was cut by a guard (${now.length} placed)`,
    metric: 'ratio',
    value: top?.ratio ?? null,
    threshold: 'watch twice the baseline share (10+ bets); flag 3x and a quarter of placements, or a new kind on 20+',
    n: now.length,
    rows,
    how: 'placed this week against the 28 days before: the bets a guard cut to a half unit, by kind',
    needs,
  });
}

// C9: the fit's terms, params and trust over the state's history. snaps: [{ day, state }] ascending (the
// day's last state.json), the current state the last word
export function c9(x) {
  const snaps = (x.snaps ?? []).filter((s) => s?.state);
  const now = x.state ?? {};
  const weekFrom = new Date(x.week.from).toISOString().slice(0, 10);
  const before = snaps.filter((s) => s.day < weekFrom);
  const start = before.at(-1)?.state ?? snaps[0]?.state ?? null;
  const baseDays = before.slice(-BASE_DAYS);
  const rows = [];
  let status = 'info';
  const bump = (s) => {
    status = status === 'info' ? s : worst(status, s);
  };
  const changelog = (now.changelog ?? []).filter((c) => inSpan(c.at, x.week));
  if (start) {
    // (the context's terms: kept to dropped, a new one, a sign flip, a size moved half)
    const termsOf = (st) => Object.fromEntries((st?.context?.terms ?? []).map((t) => [t.key, t]));
    const was = termsOf(start);
    const is = termsOf(now);
    for (const key of [...new Set([...Object.keys(was), ...Object.keys(is)])].sort()) {
      const a = was[key];
      const b = is[key];
      const keptDays = count(baseDays, (s) => (s.state.context?.terms ?? []).some((t) => t.key === key && t.kept));
      let what = null;
      if (a?.kept && !b?.kept) what = 'dropped';
      else if (!a?.kept && b?.kept) what = 'kept now';
      else if (a?.kept && b?.kept && fin(a.size) && fin(b.size) && a.size && Math.sign(a.size) !== Math.sign(b.size)) what = 'sign flipped';
      else if (a?.kept && b?.kept && fin(a.size) && fin(b.size) && a.size && Math.abs(b.size - a.size) / Math.abs(a.size) >= 0.5) what = 'size moved half';
      if (!what) continue;
      const long = what === 'dropped' && baseDays.length >= 7 && keptDays >= Math.max(7, Math.min(21, Math.ceil(0.75 * baseDays.length)));
      const s = long ? 'flag' : 'watch';
      bump(s);
      rows.push({ key: `term:${key}`, label: b?.label ?? a?.label ?? key, what, status: s, from: r4(a?.kept ? a.size : null), to: r4(b?.kept ? b.size : null), keptDays, days: baseDays.length });
    }
    // (the prop types' optional terms gone, their weights moved)
    const typesOf = (st) => Object.fromEntries((st?.props?.types ?? []).map((t) => [t.key, t]));
    const wasT = typesOf(start);
    for (const [key, t] of Object.entries(typesOf(now)).sort()) {
      const a = wasT[key]?.params;
      const b = t.params ?? {};
      if (!a) continue;
      const on = (v) => fin(v) && v !== 0;
      for (const p of ['roleK', 'fun', 'c', 'pc', 'tg', 'vc']) {
        if (on(a[p]) && !on(b[p])) {
          bump('watch');
          rows.push({ key: `prop:${key}:${p}`, label: `${t.label ?? key} ${p}`, what: 'term dropped', status: 'watch', from: r4(a[p]), to: r4(b[p] ?? null) });
        }
      }
      for (const p of ['w', 'a', 'b', 'scale']) {
        if (fin(a[p]) && fin(b[p]) && Math.abs(a[p] - b[p]) > 1e-9) rows.push({ key: `prop:${key}:${p}`, label: `${t.label ?? key} ${p}`, what: 'refit', status: 'info', from: r4(a[p]), to: r4(b[p]) });
      }
    }
    // (each market's trust: to 0, or no longer fitted)
    for (const [key, t] of Object.entries(now.trust ?? {}).sort()) {
      const a = start.trust?.[key];
      if (!a) continue;
      if (a.fitted && ((a.trust > 0 && t.trust === 0) || t.fitted === false)) {
        bump('flag');
        rows.push({ key: `trust:${key}`, label: `${key} trust`, what: t.fitted === false ? 'no longer fitted' : 'to 0', status: 'flag', from: r4(a.trust), to: r4(t.trust) });
      }
    }
  }
  // (the week's changelog by what changed: more than 6 of one a watch)
  const byWhat = {};
  for (const c of changelog) byWhat[c.what] = (byWhat[c.what] ?? 0) + 1;
  for (const [what, n] of Object.entries(byWhat).sort()) {
    if (n > 6) {
      bump('watch');
      rows.push({ key: `changelog:${what}`, label: what, what: `${n} changes this week`, status: 'watch', n });
    }
  }
  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || a.key.localeCompare(b.key));
  const needs = snaps.length ? [] : ["the state's history in git (git log of state.json)"];
  const top = rows.find((r) => r.status !== 'info');
  return check('C9', {
    status: needs.length && status === 'info' ? 'partial' : status,
    headline: top ? `${top.label}: ${top.what}${'from' in top ? ` (${top.from ?? 'off'} to ${top.to ?? 'off'})` : ''}; ${changelog.length} changelog entries this week` : `No term, param or trust dropped; ${changelog.length} changelog entries this week`,
    metric: 'changes',
    value: rows.filter((r) => r.status !== 'info').length,
    threshold: 'info; watch a term changed or more than 6 changelog entries of one kind; flag a term kept 3 weeks of 4 now dropped, or a trust gone to 0',
    n: snaps.length,
    rows: [...rows.slice(0, 20), ...changelog.slice(-12).map((c, i) => ({ key: `log:${i}`, label: c.what, what: 'changelog', status: 'info', at: c.at, from: c.from ?? null, to: c.to ?? null, why: c.why ?? '' }))],
    how: "the day's last state.json for 35 days (git), the week's start against now; the changelog's entries this week verbatim",
    needs,
  });
}

// C10: all-player and selection bias
export function c10(x) {
  const types = x.state?.props?.types ?? [];
  const graded = x.bets.filter((b) => b.market === 'prop' && settledOf(b) && inSpan(b.gradedAt, x.recent) && fin(b.actual) && fin(b.projection?.mean));
  const rows = [];
  for (const t of types) {
    const mae = t.check?.mae;
    const all = t.allPlayersBias;
    if (!fin(mae) || mae <= 0 || !fin(all)) continue;
    const r = Math.abs(all) / mae;
    const mine = graded.filter((b) => b.propType === t.key);
    const sideOf = (side) => {
      const list = mine.filter((b) => b.side === side);
      const bias = mean(list.map((b) => b.projection.mean - b.actual));
      return { n: list.length, bias: r4(bias), ofMae: r4(fin(bias) ? bias / mae : null) };
    };
    const over = sideOf('over');
    const under = sideOf('under');
    // (the bets' own miss three times the all-player bias, the way that hurts their side: an over projected too high)
    const selection = over.n >= 25 && over.bias > 0 && over.bias >= 3 * Math.abs(all) ? 'over' : under.n >= 25 && under.bias < 0 && -under.bias >= 3 * Math.abs(all) ? 'under' : null;
    const roles = {};
    for (const b of mine) if (b.projection.role) (roles[b.projection.role] ??= []).push(b.projection.mean - b.actual);
    const byRole = Object.entries(roles)
      .filter(([, v]) => v.length >= 8)
      .map(([k, v]) => ({ role: k, n: v.length, bias: r4(mean(v)) }))
      .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))
      .slice(0, 3);
    const status = r >= 0.25 || selection ? 'flag' : r >= 0.1 ? 'watch' : 'ok';
    rows.push({ key: `prop:${t.key}`, label: t.label ?? t.key, status, selection, r: r4(r), allBias: r4(all), mae: r4(mae), over, under, byRole });
  }
  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || b.r - a.r);
  const top = rows[0];
  return check('C10', {
    status: rows.length ? worst(...rows.map((r) => r.status)) : 'thin',
    headline: !top ? 'No prop fit with a check yet' : top.selection ? `${top.label} ${top.selection === 'over' ? 'Overs' : 'Unders'}: the bets projected ${sgn(top[top.selection].bias)} off (mean - actual, ${top[top.selection].n} bets) against an all-player bias of ${sgn(top.allBias)}` : `${top.label}: all-player bias ${sgn(top.allBias)} against an error of ${round(top.mae, 2)} (${pct(top.r)})`,
    metric: 'r',
    value: top?.r ?? null,
    threshold: "watch the all-player bias 10% of the error; flag 25%, or the bets' own miss 3x it the way that hurts their side (25+)",
    n: graded.length,
    rows: rows.slice(0, 10),
    tested: rows.length,
    how: "each prop fit's all-player bias (projected - actual over every player) against its mean error; the 28 days' graded props' own miss by side and role",
  });
}

// C11: band calibration
export function c11(x) {
  const graded = x.bets.filter((b) => settledOf(b) && inSpan(b.gradedAt, x.recent) && b.publishedLevel);
  const rows = [];
  for (const level of ['lock', 'high', 'medium', 'low']) {
    const list = graded.filter((b) => b.publishedLevel === level);
    if (!list.length) continue;
    const z = zOf(list, (b) => (fin(b.publishedP) ? b.publishedP : b.p));
    let status = z.n >= 10 ? 'ok' : 'thin';
    if (z.n >= 10 && fin(z.z) && z.z <= -2) status = (level === 'lock' || level === 'high') && z.n >= 20 ? 'flag' : 'watch';
    rows.push({ key: level, label: BAND_LABELS[level], status, ...z });
  }
  for (const t of x.state?.props?.types ?? []) {
    for (const c of t.check?.calibration ?? []) {
      if (!(c.n >= 30) || !fin(c.said) || !fin(c.was) || Math.abs(c.said - c.was) < 0.07) continue;
      rows.push({ key: `prop:${t.key}:${c.band}`, label: `${t.label ?? t.key} said ${pct(c.said)}`, status: 'watch', n: c.n, said: r4(c.said), was: r4(c.was), off: r4(c.was - c.said) });
    }
  }
  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || (a.z ?? 0) - (b.z ?? 0));
  const top = rows[0];
  return check('C11', {
    status: rows.length ? worst(...rows.map((r) => r.status)) : 'thin',
    headline: top ? (fin(top.e) ? `${top.label}: ${recOf(top)} at the published chances (${top.n} bets)` : `${top.label}, was ${pct(top.was)} (${top.n} in the fit's check)`) : 'No published bets graded in the 28 days',
    metric: 'z',
    value: top?.z ?? null,
    threshold: "watch a band's z -2 (10+) or a prop fit's calibration row off 7 points (30+); flag LOVE or LOCK at z -2 (20+)",
    n: graded.length,
    rows,
    how: "the 28 days' published bets by the band they were published at, against the chance they were published with; the prop fits' calibration rows",
  });
}

// C12: disruption
export function c12(x) {
  const graded = x.bets.filter((b) => settledOf(b) && inSpan(b.gradedAt, x.week));
  const broke = graded.filter((b) => weightOf(b) < 1);
  const kinds = {};
  for (const b of broke) for (const d of b.disrupted ?? []) kinds[d.kind ?? 'other'] = (kinds[d.kind ?? 'other'] ?? 0) + 1;
  const share = graded.length ? broke.length / graded.length : null;
  let status = graded.length < 15 ? 'thin' : 'ok';
  if (graded.length >= 15 && share >= 0.1) status = 'watch';
  if (graded.length >= 15 && share >= 0.15) status = 'flag';
  return check('C12', {
    status,
    headline: graded.length ? `${broke.length} of ${graded.length} graded bets (${pct(share)}) had their premise break in the game` : 'No graded bets this week',
    metric: 'share',
    value: share,
    threshold: 'watch 10%, flag 15% (15+ graded)',
    n: graded.length,
    rows: Object.entries(kinds)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => ({ key: k, n })),
    examples: broke.map((b) => b.id),
    how: "graded this week: a bet whose premise broke (postmortem.mjs: its weight under 1) by the disruption's kind",
  });
}

// C13: the open book and the pipeline
export function c13(x) {
  const now = x.now.getTime();
  const open = x.bets.filter((b) => b.status === 'open' && !b.void);
  const future = open.filter((b) => ms(b.start) > now);
  const trustOf = (b) => x.state?.trust?.[keyOf(b)]?.trust;
  const stale = [];
  for (const b of future) {
    const market = b.market === 'prop' ? 'prop' : b.market;
    let why = null;
    if (fin(b.model) && fin(b.fair) && pastGap(market, b.model, b.fair)) why = 'past the gap';
    else if (b.publishedLevel && fin(trustOf(b)) && fin(b.fair) && fin(b.model) && fin(b.odds)) {
      const p = chanceAt(market, b.fair, b.model, trustOf(b));
      const level = levelOf(b, scoreParts({ ...b, p }, x.state?.trust).score, p);
      if (level !== b.publishedLevel) why = `published ${BAND_LABELS[b.publishedLevel] ?? b.publishedLevel}, ${BAND_LABELS[level] ?? level} at today's trust`;
    }
    if (why) stale.push({ b, why });
  }
  const overdue = open.filter((b) => now - ms(b.start) > VOID_AFTER);
  const graded = x.bets.filter((b) => settledOf(b) && inSpan(b.gradedAt, x.week));
  const noClose = graded.filter((b) => !b.close);
  // (a desk with no bets yet: nothing to judge)
  let status = x.bets.length ? 'ok' : 'thin';
  if (stale.length >= 5) status = 'watch';
  if (stale.length >= 10 || overdue.length) status = 'flag';
  return check('C13', {
    status,
    headline: `${stale.length} open bets stale${stale.length >= 10 ? ' (run the desk with replace)' : ''}, ${overdue.length} past their start by ${VOID_AFTER / 36e5}h ungraded, ${noClose.length} of ${graded.length} graded this week without a close`,
    metric: 'stale',
    value: stale.length,
    threshold: `watch 5 stale; flag 10 stale or any open ${VOID_AFTER / 36e5}h past its start`,
    n: future.length,
    rows: [
      { key: 'stale', n: stale.length, why: [...new Set(stale.map((s) => s.why))].slice(0, 5) },
      { key: 'overdue', n: overdue.length },
      { key: 'graded without a close', n: noClose.length, of: graded.length },
    ],
    examples: [...overdue.map((b) => b.id), ...stale.map((s) => s.b.id)],
    how: "open bets on games not started: past the gap now, or published at a band today's trust wouldn't give them; open bets past their start plus VOID_AFTER; this week's graded bets with no close read",
  });
}

// C14: data holes
export function c14(x) {
  const fields = [
    ['team', (b) => b.market === 'prop', (b) => !b.team],
    ['intent', () => true, (b) => !b.intent],
    ['pricesFrom', (b) => b.market === 'prop', (b) => !b.pricesFrom],
    ['publishedKelly', (b) => !!b.publishedLevel, (b) => !fin(b.publishedKelly)],
    ['seen', (b) => b.market !== 'prop' && ms(b.start) < x.now.getTime(), (b) => !b.seen],
    ['projection.applied', (b) => b.market === 'prop', (b) => !b.projection?.applied],
    ['fairFrom unknown', (b) => b.market !== 'prop', (b) => !KNOWN_FAIR.has(b.fairFrom)],
    ['oddsAssumed', (b) => b.market === 'prop', (b) => !!b.oddsAssumed],
  ];
  const now = x.bets.filter((b) => inSpan(b.placedAt, x.week));
  const then = x.bets.filter((b) => inSpan(b.placedAt, x.base));
  const rows = [];
  for (const [key, applies, missing] of fields) {
    const a = now.filter(applies);
    const b = then.filter(applies);
    if (!a.length) continue;
    const n = count(a, missing);
    const share = n / a.length;
    const shareBase = b.length ? count(b, missing) / b.length : null;
    let status = a.length >= 20 && b.length >= 20 ? 'ok' : 'thin';
    if (status === 'ok' && n >= 3 && share > shareBase + 0.05) status = shareBase > 0 && share >= 2 * shareBase && n >= 5 ? 'flag' : shareBase === 0 && n >= 5 ? 'flag' : 'watch';
    rows.push({ key, status, n, of: a.length, share: r4(share), shareBase: r4(shareBase) });
  }
  const unknown = [...new Set(now.filter((b) => b.market !== 'prop' && b.fairFrom && !KNOWN_FAIR.has(b.fairFrom)).map((b) => b.fairFrom))].sort();
  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || b.share - a.share);
  const top = rows.find((r) => r.status === 'flag' || r.status === 'watch') ?? rows[0];
  return check('C14', {
    status: rows.length ? worst(...rows.map((r) => r.status)) : 'thin',
    headline: top ? `${top.key}: missing on ${top.n} of ${top.of} bets this week (${pct(top.share)})${fin(top.shareBase) ? ` against ${pct(top.shareBase)} before` : ''}${unknown.length ? `; fair chances from ${unknown.join(', ')}` : ''}` : 'No bets placed this week',
    metric: 'share',
    value: top?.share ?? null,
    threshold: 'watch a share up 5 points on the baseline (3+ bets, 20+ both); flag doubled (5+)',
    n: now.length,
    rows,
    how: 'placed this week against the 28 days before: the share of the bets each field applies to that are missing it',
  });
}

// (a fixed pick from a list, the same for the same week: the week's start mixed into each id's hash)
function pickSome(list, k, salt) {
  const h = (s) => {
    let v = 2166136261;
    for (const ch of `${salt}|${s}`) v = Math.imul(v ^ ch.charCodeAt(0), 16777619) >>> 0;
    return v;
  };
  return [...list].sort((a, b) => h(a.id) - h(b.id) || a.id.localeCompare(b.id)).slice(0, k);
}

// C15: write-ups health. writeups: writeups.json ({ items: { id: { plain, ai } } }); aiLog: the AI usage log's
// entries (ai-budget.mjs, every sport's)
export function c15(x) {
  const items = Object.entries(x.writeups?.items ?? {}).map(([id, e]) => ({ id, ...e }));
  const placedWeek = new Set(x.bets.filter((b) => inSpan(b.placedAt, x.week)).map((b) => b.id));
  const plain = items.filter((e) => e.plain?.reason);
  const lens = plain.map((e) => `${e.plain.reason} ${e.plain.risk ?? ''}`.trim().length);
  const legacy = count(plain, (e) => e.plain.legacy);
  const ai = items.filter((e) => e.ai);
  const aiWeek = ai.filter((e) => placedWeek.has(e.id) || inSpan(e.ai.at, x.week));
  const ok = aiWeek.filter((e) => e.ai.status === 'ok');
  const rejected = count(aiWeek, (e) => e.ai.status === 'rejected');
  const refused = count(aiWeek, (e) => e.ai.status === 'refused');
  const entries = (x.aiLog ?? []).filter((e) => e && typeof e.at === 'string' && fin(e.cost));
  const mine = entries.filter((e) => (!e.sport || e.sport === x.sport) && inSpan(e.at, x.week));
  const writeCalls = mine.filter((e) => /writeup/i.test(e.what ?? ''));
  const failed = count(mine, (e) => e.failed);
  const cost = mine.reduce((t, e) => t + e.cost, 0);
  const meanWrite = writeCalls.length ? writeCalls.reduce((t, e) => t + e.cost, 0) / writeCalls.length : null;
  const month = x.now.toISOString().slice(0, 7);
  const monthAll = entries.filter((e) => e.at.slice(0, 7) === month).reduce((t, e) => t + e.cost, 0);
  const capHits = count(mine, (e) => /cap/i.test(String(e.stopped ?? e.reason ?? '')));
  const tried = aiWeek.length;
  const rejectRate = tried ? (rejected + refused) / tried : null;
  let status = 'ok';
  if ((tried >= 10 && rejectRate > 0.15) || (fin(meanWrite) && meanWrite > 1.3 * WRITEUP_PLAN)) status = 'watch';
  if ((tried >= 10 && rejectRate > 0.25) || (fin(meanWrite) && meanWrite > 1.5 * WRITEUP_PLAN) || monthAll >= 0.8 * MONTH_CAP) status = 'flag';
  if (!plain.length && !ai.length && !mine.length) status = x.writeups ? 'thin' : 'partial';
  const sample = pickSome(ok, 3, x.week.from).map((e) => ({ id: e.id, headline: e.ai.headline ?? null, reason: e.ai.reason ?? '', risk: e.ai.risk ?? '' }));
  const needs = x.writeups ? [] : ['writeups.json (the picks\' write-ups, written by the desk)'];
  const rows = [
    { key: 'plain', n: plain.length, legacy, meanLength: r4(mean(lens)) },
    { key: 'claude', n: tried, ok: ok.length, rejected, refused, rejectRate: r4(rejectRate) },
    { key: 'ai calls', n: mine.length, failed, cost: r4(cost), meanWriteup: r4(meanWrite), plan: WRITEUP_PLAN, capHits },
    { key: 'ai spend', month: r4(monthAll), monthCap: MONTH_CAP, dayCap: DAY_CAP, share: r4(monthAll / MONTH_CAP) },
  ];
  const out = check('C15', {
    status: partialIf(status, needs),
    headline: `${plain.length} plain write-ups${lens.length ? ` (mean ${Math.round(mean(lens))} characters)` : ''}, ${tried} Claude analyses tried this week (${ok.length} ok); AI calls ${mine.length}, $${cost.toFixed(2)} this week, $${monthAll.toFixed(2)} of $${MONTH_CAP} this month`,
    metric: 'rejectRate',
    value: rejectRate,
    threshold: `watch rejections over 15% (10+) or a write-up's mean cost over 1.3x $${WRITEUP_PLAN}; flag 25%, 1.5x, or the month's spend 80% of $${MONTH_CAP}`,
    n: tried,
    rows,
    examples: sample.map((s) => s.id),
    how: "writeups.json's plain and Claude write-ups, and the AI usage log's calls this week (ai-budget.mjs: every sport's spend counts against the caps)",
    needs,
  });
  // (the 3 analyses to read in full: the output's writeups.sample, not the check's)
  return { ...out, sample };
}

// C16: ops. ledgerAt: the newest commit of the sport's model files; gamesInWindow: its games this week
export function c16(x) {
  const now = x.now.getTime();
  // (in whole hours: a run again within the hour writes the same file)
  const ageH = fin(ms(x.ledgerAt)) ? Math.floor((now - ms(x.ledgerAt)) / 36e5) : null;
  // (bets whose games should be graded by now: started 12 hours ago, still open)
  const overdue = x.bets.filter((b) => b.status === 'open' && !b.void && now - ms(b.start) > 12 * 36e5);
  const odds = x.state?.odds;
  const credits = fin(odds?.remaining) && fin(odds?.monthly) && odds.monthly > 0 ? odds.remaining / odds.monthly : null;
  const sources = Object.entries(x.state?.sources ?? {})
    .filter(([, s]) => s && s.ok === false)
    .map(([k]) => k)
    .sort();
  const placed = count(x.bets, (b) => inSpan(b.placedAt, x.week));
  const games = fin(x.gamesInWindow) ? x.gamesInWindow : null;
  let status = 'ok';
  if ((overdue.length && ageH > 3) || (fin(credits) && credits < 0.2) || sources.length || (games > 0 && !placed)) status = 'watch';
  if ((overdue.length && ageH > 6) || (fin(credits) && credits < 0.1)) status = 'flag';
  const needs = fin(ageH) ? [] : ["the model files' last commit (git)"];
  return check('C16', {
    status: partialIf(status, needs),
    headline: `Model files ${fin(ageH) ? `${ageH}h old` : 'of unknown age'}, ${overdue.length} open bets overdue to grade; Odds API credits ${fin(credits) ? pct(credits) : 'unknown'} left; ${placed} bets placed in a week of ${games ?? '?'} games${sources.length ? `; sources not ok: ${sources.join(', ')}` : ''}`,
    metric: 'ageH',
    value: ageH,
    threshold: 'watch files 3h old with bets overdue, credits under 20%, a source down, or no bets in a week with games; flag 6h old with bets overdue, or credits under 10%',
    n: placed,
    rows: [
      { key: 'files', ageH: r4(ageH), at: x.ledgerAt ?? null, overdue: overdue.length },
      { key: 'credits', remaining: odds?.remaining ?? null, monthly: odds?.monthly ?? null, share: r4(credits), cycleEnd: odds?.cycleEnd ?? null },
      { key: 'sources', down: sources },
      { key: 'week', placed, games },
    ],
    examples: overdue.map((b) => b.id),
    how: "the newest commit of the sport's model files, the open bets started 12 hours ago or more, The Odds API's credits (state.odds), the state's sources",
    needs,
  });
}

// C17: the CHECKs' causes (state.json's checks.learning: check-learn.mjs)
export function c17(x) {
  const l = x.state?.checks?.learning;
  if (!l) {
    return check('C17', { status: 'partial', headline: "No CHECK learning in the state yet", how: "state.json's checks.learning (check-learn.mjs checkLearning)", needs: ['state.checks.learning (the desk writes it each run)'] });
  }
  const recs = l.recommendations ?? [];
  const rows = Object.entries(l.byCause ?? {})
    .map(([cause, t]) => ({ key: cause, n: t.n, won: t.won, lost: t.lost, push: t.push, hitRate: t.hitRate, ci: t.ci, breakEven: t.breakEven, profit: t.profit, perUnit: t.perUnit, open: l.openByCause?.[cause] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  let status = (l.graded ?? 0) < MIN_N ? 'thin' : 'ok';
  if (recs.some((r) => r.kind === 'watch' || (r.kind === 'loosen' && r.change?.ready) || (r.kind === 'blind-spot' && !r.confirmed))) status = 'watch';
  if (recs.some((r) => r.kind === 'blind-spot' && r.confirmed)) status = 'flag';
  const top = recs[0];
  return check('C17', {
    status,
    headline: top ? top.text : `${l.graded ?? 0} graded CHECKs, ${l.open ?? 0} open: no advice yet`,
    metric: 'graded',
    value: l.graded ?? 0,
    threshold: `advice from ${MIN_N} graded a cause: a confirmed blind spot a flag; a lean to watch or a guard ready to loosen a watch`,
    n: l.graded ?? 0,
    rows: [...rows, ...recs.slice(0, WORST).map((r) => ({ key: `advice:${r.rank}`, kind: r.kind, cause: r.cause, confirmed: r.confirmed, text: r.text }))],
    how: "the graded CHECKs by what drove their gap (check-learn.mjs), at a unit each as if bet, and the ranked advice: recorded, never applied by the desk",
  });
}

// C18: the owner's notes by reason (state.json's checks.byReason: checks.mjs checkSummary)
export function c18(x) {
  const by = x.state?.checks?.byReason;
  const rows = Object.entries(by ?? {})
    .map(([reason, t]) => ({ key: reason, n: t.n, open: t.open, won: t.won, lost: t.lost, hitRate: t.hitRate, profit: t.profit, closed: t.closed?.n ?? 0 }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  const noted = rows.reduce((t, r) => t + r.n + r.closed, 0);
  return check('C18', {
    status: rows.length ? 'info' : by ? 'thin' : 'partial',
    headline: rows.length ? rows.map((r) => `${r.key} ${r.won}-${r.lost}${r.open ? ` (${r.open} open)` : ''}`).join(', ') : "No owner's notes on CHECKs yet",
    metric: 'noted',
    value: noted,
    threshold: 'info',
    n: noted,
    rows,
    how: "each owner's note's reason (notes.mjs) and how its CHECKs did, a closed one's counted apart: for tuning the gap",
    needs: by ? null : ['state.checks.byReason (the desk writes it each run)'],
  });
}

export const CHECKS = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18];

// The spans: the week (the 7 days to now), the baseline (the 28 before it), recent (the 28 to now)
export function spansOf(now) {
  const to = now.getTime();
  const from = to - WEEK_DAYS * DAY;
  return { week: { from, to }, base: { from: from - BASE_DAYS * DAY, to: from }, recent: { from: to - BASE_DAYS * DAY, to } };
}
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

// One sport's self-check from what's read: { sport, now, ledger, checks, state, snaps, prev, ledgerAt,
// gamesInWindow, writeups, aiLog, teams }. A check that throws is reported partial with its error
export function selfCheck(input) {
  const now = input.now ?? new Date();
  const spans = spansOf(now);
  const prevC6 = lastWeekC6(input.prev, now);
  const x = {
    ...input,
    now,
    ...spans,
    prevC6,
    bets: (input.ledger?.bets ?? []).filter((b) => b && typeof b === 'object'),
    teams: input.teams ?? {},
  };
  const checks = [];
  let writeups = null;
  for (const fn of CHECKS) {
    const id = `C${fn.name.slice(1)}`;
    try {
      const { sample, ...c } = fn(x);
      checks.push(c);
      // (the write-ups' numbers and their 3 sample analyses, on their own too)
      if (id === 'C15') writeups = { calls: c.rows.find((r) => r.key === 'ai calls')?.n ?? 0, written: c.rows.find((r) => r.key === 'claude')?.ok ?? 0, rejected: c.rows.find((r) => r.key === 'claude')?.rejected ?? 0, cost: c.rows.find((r) => r.key === 'ai calls')?.cost ?? 0, capHits: c.rows.find((r) => r.key === 'ai calls')?.capHits ?? 0, plain: c.rows.find((r) => r.key === 'plain')?.n ?? 0, sample: sample ?? [] };
    } catch (err) {
      checks.push(check(id, { status: 'partial', headline: `The check failed: ${String(err?.message ?? err).slice(0, 160)}`, needs: ['a fix to the check (selfcheck.mjs)'] }));
    }
  }
  const order = checks.map((c, i) => [c, i]).sort((a, b) => RANK[a[0].status] - RANK[b[0].status] || a[1] - b[1]);
  const summary = Object.fromEntries(STATUSES.map((s) => [s, count(checks, (c) => c.status === s)]));
  const top = order.filter(([c]) => c.status === 'flag' || c.status === 'watch').slice(0, 2);
  summary.headline = top.length ? top.map(([c]) => `${c.title}: ${c.headline}`).join('; ') : 'Nothing flagged';
  const notes = checks.filter((c) => c.needs).map((c) => `${c.id} needs ${c.needs.join(', ')}`);
  return {
    v: SELFCHECK_V,
    sport: input.sport,
    at: now.toISOString(),
    window: { from: dayOf(spans.week.from), to: dayOf(spans.week.to - 1) },
    baseline: { from: dayOf(spans.base.from), to: dayOf(spans.base.to - 1) },
    summary,
    checks: order.map(([c]) => c),
    writeups,
    notes,
    // (the CLV rows C6 compares against next week: carried through a run again within the week)
    prevC6,
  };
}

// (the last self-check's CLV rows from 5 days back or more: the previous file's own, or, where it's this
// week's run again, the ones it carried; so C6's two weeks running are two weeks, however often it's run)
export const PREV_MIN_DAYS = 5;
export function lastWeekC6(prev, now) {
  if (!prev || typeof prev !== 'object') return null;
  if (now.getTime() - ms(prev.at) >= PREV_MIN_DAYS * DAY) {
    const c = (prev.checks ?? []).find((x) => x?.id === 'C6');
    return c ? { at: prev.at, rows: c.rows ?? [] } : null;
  }
  return prev.prevC6 && Array.isArray(prev.prevC6.rows) ? prev.prevC6 : null;
}

// (the output as written: keys sorted, numbers to 4 places, so a run that learned nothing writes nothing)
export function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]).filter(([, x]) => x !== undefined));
  if (typeof v === 'number') return fin(v) ? round(v, 4) : null;
  return v;
}

// Writes the self-check when something but its `at` changed: true when written
export function writeIfChanged(file, data) {
  const out = canon(data);
  const strip = (x) => JSON.stringify({ ...x, at: null });
  try {
    if (existsSync(file) && strip(JSON.parse(readFileSync(file, 'utf8'))) === strip(out)) return false;
  } catch {
    // (an unreadable one written over: it's this script's own output)
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  return true;
}

// ---- reading (the CLI's: git and the files) ----

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const readJsonOr = (file, fallback) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};

// The day's last committed state.json for the days back (git; none without git): [{ day, at, state }] ascending
export function stateHistory(rel, days = BASE_DAYS + WEEK_DAYS) {
  try {
    const log = git(['log', `--since=${days}.days`, '--format=%H %cI', '--', rel]).trim();
    if (!log) return [];
    const byDay = new Map();
    for (const line of log.split('\n')) {
      const [hash, at] = line.split(' ');
      const day = new Date(at).toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, { hash, at });
    }
    const out = [];
    for (const [day, { hash, at }] of [...byDay].sort((a, b) => a[0].localeCompare(b[0]))) {
      try {
        out.push({ day, at, state: JSON.parse(git(['show', `${hash}:${rel}`])) });
      } catch {
        // (a day's file unreadable: skipped)
      }
    }
    return out;
  } catch {
    return [];
  }
}

// One sport's inputs from the repository
export function readSport(sport, now) {
  const model = path.join(ROOT, 'apps', sport, 'src/StaticData/model');
  const rel = (f) => path.posix.join('apps', sport, 'src/StaticData/model', f);
  const ledger = readJsonOr(path.join(model, 'ledger.json'), null);
  if (!ledger) return null;
  const spans = spansOf(now);
  const games = (() => {
    try {
      const list = JSON.parse(readFileSync(path.join(ROOT, 'apps', sport, 'scripts/model/games.json'), 'utf8'));
      return count(list, (g) => inSpan(g.date, spans.week));
    } catch {
      return null;
    }
  })();
  let ledgerAt = null;
  try {
    ledgerAt = git(['log', '-1', '--format=%cI', '--', `apps/${sport}/src/StaticData/model/ledger.json`]).trim() || null;
  } catch {
    // (no git: unknown)
  }
  const teamsFile = readJsonOr(path.join(model, 'teams.json'), null);
  const teams = Object.fromEntries(Object.entries(teamsFile?.teams ?? {}).map(([abbr, t]) => [String(t.id), abbr]));
  return {
    sport,
    now,
    ledger,
    checks: readJsonOr(path.join(model, 'checks.json'), null)?.checks ?? ledger.checks ?? [],
    state: readJsonOr(path.join(model, 'state.json'), {}),
    snaps: stateHistory(rel('state.json')),
    prev: readJsonOr(path.join(model, 'selfcheck.json'), null),
    ledgerAt,
    gamesInWindow: games,
    writeups: readJsonOr(path.join(ROOT, 'apps', sport, 'scripts/model/writeups.json'), null),
    aiLog: readJsonOr(path.join(ROOT, '.cache/model/ai-usage.json'), null)?.entries ?? null,
    teams,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const at = args.indexOf('--now');
  const now = at >= 0 ? new Date(args[at + 1]) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`--now: not a date (${args[at + 1]})`);
  const named = args.filter((a, i) => !a.startsWith('--') && !(at >= 0 && i === at + 1));
  const sports = named.length ? named : ['nfl', 'nba', 'nhl', 'mlb'];
  for (const sport of sports) {
    try {
      const input = readSport(sport, now);
      if (!input) {
        console.log(`${sport}: no ledger, no self-check`);
        continue;
      }
      const out = selfCheck(input);
      const s = out.summary;
      console.log(`${sport}: self-check ${out.window.from} to ${out.window.to}: ${s.flag} flag, ${s.watch} watch, ${s.partial} partial, ${s.ok} ok, ${s.thin} thin, ${s.info} info. ${s.headline}`);
      for (const c of out.checks) if (c.status === 'flag' || c.status === 'watch') console.log(`  ${c.id} ${c.status}: ${c.title}: ${c.headline}`);
      if (dry) continue;
      const file = path.join(ROOT, 'apps', sport, 'src/StaticData/model/selfcheck.json');
      console.log(`  ${writeIfChanged(file, out) ? 'written' : 'unchanged'}: ${path.relative(ROOT, file)}`);
    } catch (err) {
      console.warn(`::warning::${sport}: the self-check failed (${String(err?.message ?? err).slice(0, 200)}); the others go on`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
