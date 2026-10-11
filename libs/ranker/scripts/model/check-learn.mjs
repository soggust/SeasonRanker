// The CHECKs' self-evaluation: what drives each CHECK's disagreement with the book (diagnose, free and the
// same every time, from the CHECK's own numbers), and what the graded ones say about each cause (checkLearning:
// the hit rate and the profit a unit by cause, then ranked recommendations). Pure: no I/O, no clock.
//
//   diagnosis  diagnose(c): the one part of the projection that most likely makes the gap, tagged from CAUSES
//              by the first rule that holds (a prop's in this order):
//                role                      a role CHECK (props.mjs roleChangeOf), its sub-reason its roleReason
//                unpriced                  priced at an assumed -110 (no book price): the book's chance an even
//                                          guess, the gap against no real price
//                missing-starter-not-seen  the line MISSING_RATIO or more off his projection and off his recent
//                                          form too, nothing missing seen around him: the market higher (sub
//                                          teammate-out: a teammate's work the model didn't see go), or lower
//                                          (sub own-status: he himself limited, the model reading him as usual)
//                vacated-fade              the vacated term (vacF) VAC_STEP or more off 1, toward the model's side
//                                          (sub boost or fade)
//                early-season-prior        EARLY_MAX or fewer games this season and: the prior PRIOR_W or more of
//                                          his rate (the projection's priorW: K / (games + K), K against his starts
//                                          or snaps where the role-aware base took them: sub prior-weight);
//                                          an older CHECK without priorW, EARLY_GAMES or fewer (few-games); or his
//                                          recent form within RECENT_NEAR of the line while his blended rate is
//                                          RATE_FAR off it on the model's side (recent-at-line)
//                matchup | game-script | context-term
//                                          the step from his rate to the projection (writeup.mjs driversOf: each
//                                          by the effect it had) that moves him most toward the model's side,
//                                          DRIVER_MIN or more: the opponent and its funnel, pace and targets;
//                                          the game script; the context terms
//                dispersion                the projection within NEAR of the line: the gap is the spread's
//                                          shape (r, the calibration), not the mean
//                unknown                   none of these
//              a game market's: role and unpriced never; context-term where the context's adjustment (adj)
//              carries half the model's distance from the line or more, toward its side; dispersion within
//              NEAR_PTS of the line; else matchup (sub ratings: the teams' ratings against the market). Each
//              with its numbers (n: the line, the projection, line/mean, line/rate, line/recent, vacF, games,
//              the prior's weight, the gap; a game's expected score and adjustment) and every other rule that
//              held (also). Kept on the CHECK (checks.mjs checkOf: diagnosis), public fields alone
//   learning   checkLearning(checks): the open CHECKs counted by cause (openByCause, a role's by its
//              sub-reason: role:<sub>), and the graded CHECKs (closed ones and voids out, as checkSummary's hit
//              rate), by cause, by cause and stat, and a role's by its sub-reason: the record, the hit rate with
//              a 95% Wilson interval, the break-even of their prices, the profit and the profit a unit. An
//              older CHECK without a diagnosis diagnosed now (a trimmed one's projection gone: role or unknown)
//   advice     recommendations, ranked: a cause whose interval sits under its break-even (MIN_N graded or
//              more) a confirmed blind spot, the market right, named with its evidence and the fix it points
//              to (FIXES); one under it but not yet clear a lean to watch; one whose interval sits over its
//              break-even a guard that can loosen, with the threshold change it supports (loosenFor). Never
//              applied by the desk: a loosening is recorded (ready only with LOOSEN_N graded or more and the
//              interval's low end LOOSEN_MARGIN over the break-even), for the owner to make by hand

import { decimal, GAP } from './desk.mjs';
import { ROLE } from './props.mjs';
import { round } from './ratings.mjs';
import { driversOf } from './writeup.mjs';

export const DIAGNOSIS_V = 1;
export const CAUSES = ['role', 'unpriced', 'missing-starter-not-seen', 'vacated-fade', 'early-season-prior', 'matchup', 'game-script', 'context-term', 'dispersion', 'unknown'];
export const CAUSE_LABELS = {
  role: 'Role change',
  unpriced: 'Unpriced (assumed -110)',
  'missing-starter-not-seen': 'Missing player not seen',
  'vacated-fade': 'Vacated work',
  'early-season-prior': 'Early-season prior',
  matchup: 'Opponent / matchup',
  'game-script': 'Game script',
  'context-term': 'Context term',
  dispersion: 'Dispersion / skew',
  unknown: 'Unknown',
};
// (the rules' thresholds)
export const DIAG = { MISSING_RATIO: 1.25, RECENT_RATIO: 1.15, VAC_STEP: 0.08, EARLY_GAMES: 3, EARLY_MAX: 8, PRIOR_W: 0.5, RECENT_NEAR: 0.1, RATE_FAR: 0.15, DRIVER_MIN: 0.08, NEAR: 0.12, NEAR_PTS: 2, ADJ_PTS: 1.5 };
// (the learning's: the graded a cause needs before it's advised on, a loosening's before it's ready, and the
// margin the interval's low end must clear the break-even by)
export const MIN_N = 10;
export const LOOSEN_N = 40;
export const LOOSEN_MARGIN = 0.03;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const r3 = (v) => (fin(v) ? round(v, 3) : null);
const has = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

// (the driver steps' causes: driversOf's names)
const DRIVER_CAUSE = { opponent: 'matchup', funnel: 'matchup', pace: 'matchup', targets: 'matchup', script: 'game-script', context: 'context-term' };

// A prop CHECK's diagnosis (see above)
function diagnoseProp(c) {
  const p = c.projection ?? {};
  const dir = c.side === 'under' ? -1 : 1;
  const line = c.line;
  const ratio = (x) => (fin(line) && fin(x) && x > 0 ? line / x : null);
  const priorW = fin(p.priorW) ? p.priorW : null;
  const n = {
    line: fin(line) ? line : null,
    mean: fin(p.mean) ? p.mean : null,
    rate: fin(p.rate) ? p.rate : null,
    recent: fin(p.recent) ? p.recent : null,
    lineMean: r3(ratio(p.mean)),
    lineRate: r3(ratio(p.rate)),
    lineRecent: r3(ratio(p.recent)),
    vac: fin(p.vac) ? p.vac : null,
    vacHist: fin(p.vacHist) ? p.vacHist : null,
    vacF: fin(p.vacF) ? p.vacF : null,
    games: fin(p.games) ? p.games : null,
    priorW,
    model: c.model ?? null,
    fair: c.fair ?? null,
    gap: fin(c.gap) ? c.gap : fin(c.model) && fin(c.fair) ? round(c.model - c.fair, 4) : null,
  };
  const tags = [];
  if (c.cause === 'role') tags.push({ cause: 'role', sub: c.roleReason ?? 'role', why: `his role changing (${c.roleReason ?? 'role'}): the book reprices a role on the news, the model on the logs` });
  if (c.oddsAssumed) tags.push({ cause: 'unpriced', why: 'priced at an assumed -110: the book’s chance an even guess, so the gap is against no real price' });
  const seen = (fin(p.vac) && p.vac >= 0.05) || has(p.out);
  const lm = n.lineMean;
  const lr = n.lineRecent ?? lm;
  if (fin(lm) && !seen) {
    if (dir < 0 && lm >= DIAG.MISSING_RATIO && lr >= DIAG.RECENT_RATIO) tags.push({ cause: 'missing-starter-not-seen', sub: 'teammate-out', why: `the line ${lm}x his projection and ${lr}x his recent form with no one missing seen around him: a teammate's work the model hasn't seen go` });
    if (dir > 0 && lm <= 1 / DIAG.MISSING_RATIO && lr <= 1 / DIAG.RECENT_RATIO) tags.push({ cause: 'missing-starter-not-seen', sub: 'own-status', why: `the line ${lm}x his projection and ${lr}x his recent form: the market sees him limited, the model as usual` });
  }
  if (fin(p.vacF) && Math.abs(p.vacF - 1) >= DIAG.VAC_STEP && (p.vacF - 1) * dir > 0) tags.push({ cause: 'vacated-fade', sub: p.vacF > 1 ? 'boost' : 'fade', why: `the vacated term's ${p.vacF} (the missing work's cut ${p.vac ?? '?'} now against ${p.vacHist ?? '?'} in his games) moves him toward the model's side` });
  if (fin(p.games) && p.games <= DIAG.EARLY_MAX) {
    const g = `${p.games} game${p.games === 1 ? '' : 's'} this season`;
    const lc = n.lineRecent;
    const lt = n.lineRate;
    // (the prior pulling toward the model's side: his blended rate past his own form this season, toward it)
    const pulls = !fin(p.recent) || (p.rate - p.recent) * dir > 0;
    if (pulls && priorW !== null && priorW >= DIAG.PRIOR_W) tags.push({ cause: 'early-season-prior', sub: 'prior-weight', why: `${g}, the prior ${Math.round(priorW * 100)}% of his rate: last season's or his position's numbers carry him` });
    else if (pulls && priorW === null && p.games <= DIAG.EARLY_GAMES) tags.push({ cause: 'early-season-prior', sub: 'few-games', why: `${g}: last season's or his position's numbers carry him` });
    else if (fin(lc) && fin(lt) && Math.abs(lc - 1) <= DIAG.RECENT_NEAR && Math.abs(lt - 1) >= DIAG.RATE_FAR && (p.rate - line) * dir > 0) tags.push({ cause: 'early-season-prior', sub: 'recent-at-line', why: `${g}: his recent form at the line (${lc}x), his blended rate off it (${lt}x): the prior holds him where the market has moved on` });
  }
  const d = driversOf(c);
  const toward = d.steps
    .filter((s) => DRIVER_CAUSE[s.name] && Math.log(s.factor) * dir > 0 && Math.abs(s.factor - 1) >= DIAG.DRIVER_MIN)
    .sort((a, b) => Math.abs(Math.log(b.factor)) - Math.abs(Math.log(a.factor)));
  for (const s of toward) if (!tags.some((t) => t.cause === DRIVER_CAUSE[s.name])) tags.push({ cause: DRIVER_CAUSE[s.name], sub: s.name, why: `the ${s.name} step moves him ${s.appliedPct > 0 ? '+' : ''}${s.appliedPct}% toward the model's side` });
  if (toward.length) n.driver = { name: toward[0].name, pct: toward[0].appliedPct };
  if (fin(lm) && Math.abs(lm - 1) < DIAG.NEAR) tags.push({ cause: 'dispersion', sub: dir > 0 ? 'over' : 'under', why: `his projection within ${Math.round(DIAG.NEAR * 100)}% of the line: the gap is the spread's shape${fin(p.r) ? ` (r ${p.r})` : ''}, not the mean` });
  if (fin(p.r)) n.r = p.r;
  return { n, tags };
}

// A game market's (see above)
function diagnoseGame(c) {
  const dir = c.side === 'under' || c.side === 'away' ? -1 : 1;
  const adj = c.context?.adj ?? {};
  const n = { line: fin(c.line) ? c.line : null, expMargin: c.expMargin ?? null, expTotal: c.expTotal ?? null, adjMargin: fin(adj.margin) ? adj.margin : null, adjTotal: fin(adj.total) ? adj.total : null, model: c.model ?? null, fair: c.fair ?? null, gap: fin(c.gap) ? c.gap : null };
  let dist = null;
  let a = null;
  if (c.market === 'total' && fin(c.expTotal) && fin(c.line)) {
    dist = c.expTotal - c.line;
    a = n.adjTotal;
  } else if (fin(c.expMargin)) {
    const mine = dir * c.expMargin;
    dist = c.market === 'spread' && fin(c.line) ? mine + c.line : mine;
    a = fin(n.adjMargin) ? dir * n.adjMargin : null;
    if (c.market === 'total') a = null;
  }
  if (fin(dist)) n.dist = round(dist, 2);
  // (a total's adjustment toward the model's side: over is up)
  const toward = fin(a) && c.market === 'total' ? a * dir : a;
  const tags = [];
  if (fin(toward) && toward >= DIAG.ADJ_PTS && (!fin(dist) || toward >= 0.5 * Math.abs(dist))) tags.push({ cause: 'context-term', why: `the context adds ${round(toward, 1)} points toward the model's side, half its distance from the line or more` });
  if (fin(dist) && Math.abs(dist) < DIAG.NEAR_PTS) tags.push({ cause: 'dispersion', why: `the expected score within ${DIAG.NEAR_PTS} points of the line: the gap is the margin's shape, not the mean` });
  tags.push({ cause: 'matchup', sub: 'ratings', why: "the teams' ratings against the market's read of them" });
  return { n, tags };
}

// A CHECK's diagnosis: { v, cause, sub?, why, n, also } (see above)
export function diagnose(c) {
  if (!c || typeof c !== 'object') return null;
  const { n, tags } = c.market === 'prop' ? diagnoseProp(c) : diagnoseGame(c);
  const first = tags[0] ?? { cause: 'unknown', why: 'no one part of the projection explains the gap' };
  return { v: DIAGNOSIS_V, cause: first.cause, ...(first.sub ? { sub: first.sub } : {}), why: first.why, n, also: tags.slice(1).map((t) => t.cause).filter((k, i, all) => k !== first.cause && all.indexOf(k) === i) };
}

// (a CHECK's diagnosis as the learning reads it: its own, else made now; a trimmed one without, by its guard)
export function diagnosisOf(c) {
  if (c?.diagnosis?.cause) return c.diagnosis;
  if (c?.trimmed && !c.projection?.rate) return { cause: c.cause === 'role' ? 'role' : 'unknown', ...(c.cause === 'role' && c.roleReason ? { sub: c.roleReason } : {}) };
  return diagnose(c) ?? { cause: 'unknown' };
}

// A 95% Wilson interval on k of n
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [round(Math.max(0, mid - half), 4), round(Math.min(1, mid + half), 4)];
}

// (a list of graded CHECKs' tally: their record at a unit each, the hit rate and its interval, the break-even
// of their prices (the average of 1 over each one's decimal price, the decided ones'), the profit and a unit's)
export function tallyOf(list) {
  const done = list.filter((c) => c.checkResult && !c.checkResult.void);
  const won = done.filter((c) => c.checkResult.status === 'won').length;
  const lost = done.filter((c) => c.checkResult.status === 'lost').length;
  const decided = done.filter((c) => c.checkResult.status === 'won' || c.checkResult.status === 'lost');
  const profit = done.reduce((t, c) => t + (c.checkResult.profit ?? 0), 0);
  const be = decided.length ? decided.reduce((t, c) => t + 1 / decimal(Number.isFinite(c.odds) && c.odds ? c.odds : -110), 0) / decided.length : null;
  return {
    n: done.length,
    won,
    lost,
    push: done.length - won - lost,
    hitRate: won + lost ? round(won / (won + lost), 4) : null,
    ci: wilson(won, won + lost),
    breakEven: be === null ? null : round(be, 4),
    profit: round(profit, 2),
    perUnit: done.length ? round(profit / done.length, 3) : null,
  };
}

// (the threshold change a cause's winning record supports: the guard it would loosen, from and to)
export function loosenFor(cause, sub = null, market = 'prop') {
  if (cause === 'role') {
    const role = {
      'few-starts': { guard: 'ROLE.fewStarts', from: ROLE.fewStarts, to: Math.max(1, ROLE.fewStarts - 2) },
      'group-out': { guard: 'ROLE.vac', from: ROLE.vac, to: round(ROLE.vac + 0.1, 2) },
      'snap-jump': { guard: 'ROLE.snapJump', from: ROLE.snapJump, to: round(ROLE.snapJump + 0.05, 2) },
      'part-time': { guard: 'ROLE.partTime', from: ROLE.partTime, to: round(ROLE.partTime - 0.1, 2) },
      line: { guard: 'ROLE.ratioHi / ROLE.ratioLo', from: `${ROLE.ratioHi} / ${ROLE.ratioLo}`, to: `${round(ROLE.ratioHi + 0.2, 2)} / ${round(ROLE.ratioLo - 0.1, 2)}` },
    }[sub];
    return role ?? { guard: `the role guard's ${sub ?? 'role'} CHECK`, from: 'a CHECK', to: 'priced and bet as any prop' };
  }
  const limit = GAP[market] ?? GAP.prop;
  return { guard: `GAP.${market in GAP ? market : 'prop'} for CHECKs diagnosed ${cause}`, from: limit, to: round(limit + 0.05, 2) };
}

// (where a confirmed blind spot points: the fix to make next)
export const FIXES = {
  role: 'the role guard is right to hold these: keep it, and build the projection a new role needs before betting them',
  unpriced: 'the assumed -110 hides the real price: keep these unpriced lines out of the CHECKs, or wait for the book’s price',
  'missing-starter-not-seen': 'the injury report and roster miss who is out: read the inactives and depth charts (or research these) before pricing',
  'vacated-fade': 'the vacated term (vc) sizes a missing teammate’s work wrongly here: refit vc for these stats, or cap vacF',
  'early-season-prior': 'the prior holds too long early in a season: refit kd (K shrinking with his games) or a smaller K for these stats',
  matchup: 'the opponent terms over-reach here (a, the funnel, pace, targets; a game’s ratings): shrink them or weigh the opponent’s recent form',
  'game-script': 'the game script’s power b over-reaches here: refit b on these games',
  'context-term': 'a context term reads the wrong way here: check its size and its input',
  dispersion: 'the spread’s shape (r, rk, the calibration) is off at lines near the mean: refit the calibration on lines near the projection',
  unknown: 'no one part of the projection explains these: research them (CHECK_RESEARCH) or read them one by one',
};

// The graded CHECKs' learning (see above): { v, graded, byCause, byRole, byCauseStat, recommendations }
export function checkLearning(all = []) {
  const live = (Array.isArray(all) ? all : []).filter((c) => c && !c.closedAt);
  const graded = live.filter((c) => c.checkResult && !c.checkResult.void);
  const statOf = (c) => (c.market === 'prop' ? `prop:${c.propType}` : c.market);
  const rows = graded.map((c) => ({ c, d: diagnosisOf(c) }));
  const group = (key) => {
    const out = {};
    for (const { c, d } of rows) {
      const k = key(c, d);
      if (k) (out[k] ??= []).push(c);
    }
    return Object.fromEntries(Object.keys(out).sort().map((k) => [k, tallyOf(out[k])]));
  };
  const byCause = group((c, d) => d.cause);
  // (the open ones by cause too: what the CHECKs waiting on their games are made of)
  const openByCause = {};
  for (const c of live) if (!c.checkResult) {
    const d = diagnosisOf(c);
    const k = d.cause === 'role' ? `role:${d.sub ?? 'role'}` : d.cause;
    openByCause[k] = (openByCause[k] ?? 0) + 1;
  }
  const byRole = group((c, d) => (d.cause === 'role' ? (d.sub ?? 'role') : null));
  const byCauseStat = {};
  for (const [k, t] of Object.entries(group((c, d) => `${d.cause}|${statOf(c)}`))) {
    const [cause, stat] = k.split('|');
    (byCauseStat[cause] ??= {})[stat] = t;
  }
  // (the market most of a cause's CHECKs are in: a loosening's gap is that market's)
  const marketOf = (cause) => {
    const counts = {};
    for (const { c, d } of rows) if (d.cause === cause) counts[c.market] = (counts[c.market] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'prop';
  };
  const recs = [];
  const advise = (cause, sub, t) => {
    if (!t.ci || t.won + t.lost < MIN_N || t.breakEven === null) return;
    const name = sub ? `${cause}:${sub}` : cause;
    const label = `${CAUSE_LABELS[cause] ?? cause}${sub ? ` (${sub})` : ''}`;
    const ev = `${t.won}-${t.lost}${t.push ? `-${t.push}` : ''}, ${Math.round(t.hitRate * 100)}% [${Math.round(t.ci[0] * 100)}-${Math.round(t.ci[1] * 100)}%] against ${Math.round(t.breakEven * 100)}% to break even, ${t.profit >= 0 ? '+' : ''}${t.profit}u (${t.perUnit >= 0 ? '+' : ''}${t.perUnit}u a CHECK)`;
    const evidence = { n: t.n, won: t.won, lost: t.lost, push: t.push, hitRate: t.hitRate, ci: t.ci, breakEven: t.breakEven, profit: t.profit, perUnit: t.perUnit };
    if (t.ci[1] < t.breakEven) recs.push({ kind: 'blind-spot', cause: name, label, confirmed: true, evidence, text: `Blind spot: ${label}, the market right (${ev}). Next fix: ${FIXES[cause] ?? FIXES.unknown}`, score: -t.profit + 100 });
    else if (t.hitRate < t.breakEven && t.perUnit < 0) recs.push({ kind: 'watch', cause: name, label, confirmed: false, evidence, text: `Watch: ${label} leans the market's way (${ev}), not yet clear of chance`, score: -t.profit });
    else if (t.ci[0] > t.breakEven) {
      const change = loosenFor(cause, sub, marketOf(cause));
      const ready = t.won + t.lost >= LOOSEN_N && t.ci[0] >= t.breakEven + LOOSEN_MARGIN;
      recs.push({
        kind: 'loosen',
        cause: name,
        label,
        confirmed: ready,
        evidence,
        change: { ...change, ready, applied: false },
        text: `Guard can loosen: ${label}, the model right (${ev}). Supports ${change.guard} ${change.from} → ${change.to}${ready ? '' : ` (not yet: ${LOOSEN_N} graded and the interval ${Math.round(LOOSEN_MARGIN * 100)} points clear of break-even first)`}; recorded, never applied by the desk`,
        score: t.profit,
      });
    }
  };
  for (const [cause, t] of Object.entries(byCause)) if (cause !== 'role') advise(cause, null, t);
  for (const [sub, t] of Object.entries(byRole)) advise('role', sub, t);
  const order = { 'blind-spot': 0, loosen: 1, watch: 2 };
  recs.sort((a, b) => order[a.kind] - order[b.kind] || b.confirmed - a.confirmed || b.score - a.score);
  return {
    v: DIAGNOSIS_V,
    graded: graded.length,
    open: live.filter((c) => !c.checkResult).length,
    byCause,
    byRole,
    byCauseStat,
    openByCause: Object.fromEntries(Object.entries(openByCause).sort()),
    recommendations: recs.map(({ score: _s, ...r }, i) => ({ rank: i + 1, ...r })),
    thresholds: { minN: MIN_N, loosenN: LOOSEN_N, loosenMargin: LOOSEN_MARGIN },
  };
}
