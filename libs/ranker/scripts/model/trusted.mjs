// The trusted-edge bands (the owner's idea, 2026-10-20; DECISIONS.md D72): "take the pieces of the formula that are
// most weighted (most accurate) and if the bet hits those to a certain degree AND is a positive enough kelly score it
// gets a confidence". Research for the band lab (band-lab.mjs mode 'trusted'): nothing here prices or places a bet.
//
//   pieces       a bet's edge (the Bot's chance less the fair) split into the model's pieces (REPLAY_ATTR=1 on the
//                replay: ratings.mjs, backtest.mjs repriced, gate-history.mjs finish, gate.mjs propParts): a game
//                line's context groups (rest, travel, starters, weather, matchups, officials, park ...) each the chance
//                less the one with that group's terms out of the margin or total; a prop's drivers (form, role,
//                vacated, opponent, funnel, targets, pace, script, context, fit) each the chance less the one with that
//                factor out of his mean; each scaled by what the anchor and the trust kept (pCur - f over raw - f);
//                base the rest of the gap (the ratings, or his own rate, against the Book), cal the residual blend's
//   reliability  per sport and class (lines, props), walk-forward by month from the close rows settled before the
//                month only: the results' excess over the fair (y - f) regressed on every piece at once (ridge toward
//                0), each piece's slope and its standard error; the log loss against the Book's with that piece alone
//                moving the chance; a piece is proven when its slope's lower bound (1.645 SE) clears 0 over 500 rows
//                that carry it and its log loss beats the Book's
//   trusted edge the sum of a bet's pieces times each one's reliability (its slope, held to [0, 1]; 0 unproven)
//   bands        LOVE / LOCK when the trusted edge clears a bar AND the Kelly score clears a floor: absolute bars, or
//                percentiles of the trusted edge (or trusted edge times Kelly) among the bets settled before

const fin = Number.isFinite;
export const GAME_HOURS = 3;
const MONTH = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
export const classOf = (market) => (market === 'prop' ? 'prop' : 'line');

// (the pieces' words, as the popover names them)
export const PIECE_NAMES = {
  base: { line: 'team ratings vs the Book', prop: "his own rate vs the Book" },
  cal: 'the calibration',
  rest: 'rest edge',
  travel: 'travel and body clock',
  starters: 'starters and lineups',
  weather: 'weather',
  matchups: 'matchup',
  officials: 'officials',
  park: 'the park',
  strength: 'strength of schedule',
  ranker: 'the rankings',
  form: 'recent form',
  role: 'his role trend',
  vacated: 'usage from teammates out',
  opponent: 'matchup vs position',
  funnel: 'the defense funnel',
  targets: 'where targets go',
  pace: 'pace',
  script: 'the game script',
  context: 'game context',
  fit: "the fit's scale",
};
export const pieceName = (k, cls = 'line') => {
  const n = PIECE_NAMES[k];
  return typeof n === 'object' ? n[cls] : (n ?? k);
};

// (solve A x = b, A symmetric positive definite: Gaussian elimination with partial pivoting; and A's inverse)
function solve(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}
const inverseDiag = (A) => A.map((_, i) => solve(A, A.map((__, j) => (i === j ? 1 : 0)))[i]);

const LL = (p, y) => -Math.log(y ? Math.min(0.999, Math.max(0.001, p)) : Math.min(0.999, Math.max(0.001, 1 - p)));
export const TRUST_DEFAULTS = { minN: 500, z: 1.645, ridge: 200, cap: 1, mainMin: 0.005 };

// One class's accumulator: the joint regression's sums, each piece's log loss and main-driver tallies
function acc() {
  return { keys: [], idx: new Map(), XX: [], Xy: [], yy: 0, n: 0, sq: [], per: new Map() };
}
function keyIdx(a, k) {
  if (a.idx.has(k)) return a.idx.get(k);
  const i = a.keys.length;
  a.keys.push(k);
  a.idx.set(k, i);
  for (const r of a.XX) r.push(0);
  a.XX.push(new Array(a.keys.length).fill(0));
  a.Xy.push(0);
  a.sq.push(0);
  return i;
}
function addRow(a, f, y, attr, mainMin, cur = {}) {
  const e = y - f;
  const nz = [];
  let main = null;
  for (const [k, v] of Object.entries(attr)) {
    if (!fin(v) || Math.abs(v) < 1e-4) continue;
    const i = keyIdx(a, k);
    nz.push([i, v]);
    const g = a.per.get(k) ?? a.per.set(k, { n: 0, llBook: 0, llPiece: 0, mainN: 0, mainHit: 0, mainExp: 0, hoN: 0, hoGain: 0 }).get(k);
    g.n++;
    g.llBook += LL(f, y);
    g.llPiece += LL(f + v, y);
    if (!main || Math.abs(v) > Math.abs(main[1])) main = [k, v];
  }
  // (held out: the row read at the weights fit before its month (cur, each slope held to [0, cap]), the joint chance
  // with every piece against the one without piece k: k's out-of-sample log-loss gain where it moves the chance)
  const wOf = (k) => Math.min(TRUST_DEFAULTS.cap * 2, Math.max(0, cur[k]?.slope ?? 0));
  let full = f;
  for (const [i, v] of nz) full += wOf(a.keys[i]) * v;
  const llFull = LL(full, y);
  for (const [i, v] of nz) {
    const k = a.keys[i];
    if (!cur[k]) continue;
    const g = a.per.get(k);
    g.hoN++;
    g.hoGain += LL(full - wOf(k) * v, y) - llFull;
  }
  for (const [i, v] of nz) {
    a.Xy[i] += v * e;
    a.sq[i] += v * v;
    for (const [j, w] of nz) a.XX[i][j] += v * w;
  }
  a.yy += e * e;
  a.n++;
  if (main && Math.abs(main[1]) >= mainMin) {
    const g = a.per.get(main[0]);
    g.mainN++;
    const up = main[1] > 0;
    g.mainHit += up ? y : 1 - y;
    g.mainExp += up ? f : 1 - f;
  }
}
// (a class's reliability now: each piece's slope, SE, log-loss gain, main-driver excess, proven, and its weight)
function readAcc(a, o) {
  const K = a.keys.length;
  if (!K || a.n < 50) return {};
  const A = a.XX.map((r, i) => r.map((v, j) => v + (i === j ? o.ridge * (a.sq[i] / a.n) + 1e-9 : 0)));
  const b = solve(A, a.Xy);
  const s2 = Math.max(1e-6, a.yy / a.n);
  const inv = inverseDiag(A);
  const out = {};
  a.keys.forEach((k, i) => {
    const g = a.per.get(k);
    const se = Math.sqrt(Math.max(0, s2 * inv[i]));
    const gain = g.n ? (g.llBook - g.llPiece) / g.n : 0;
    const ho = g.hoN ? g.hoGain / g.hoN : 0;
    const proven = g.n >= o.minN && b[i] - o.z * se > 0 && g.hoN >= o.minN / 2 && ho > 0;
    out[k] = { slope: b[i], se, n: g.n, gain, hoN: g.hoN, ho, mainN: g.mainN, mainEdge: g.mainN ? (g.mainHit - g.mainExp) / g.mainN : null, proven, w: proven ? Math.min(o.cap, Math.max(0, b[i])) : 0 };
  });
  return out;
}

// The walk: rows [t, market, stat, f, y, attr] (the replay's -attr.json, the over's or home's side), oldest first.
// { at(t, cls): the reliability as of t's month (rows settled before the month's start), months: [[monthStart, {line,
// prop}]], final: {line, prop} (every row: what a live rule reads) }
export function walkTrust(rows, opts = {}) {
  const o = { ...TRUST_DEFAULTS, ...opts };
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const A = { line: acc(), prop: acc() };
  const months = [];
  let i = 0;
  const firstMonth = sorted.length ? MONTH(sorted[0][0]) : 0;
  const lastMonth = sorted.length ? MONTH(sorted[sorted.length - 1][0] + 40 * 864e5) : 0;
  let cur = { line: {}, prop: {} };
  for (let m = firstMonth; m <= lastMonth; m = MONTH(m + 32 * 864e5)) {
    while (i < sorted.length && sorted[i][0] + GAME_HOURS * 36e5 < m) {
      const [, market, , f, y, attr] = sorted[i++];
      addRow(A[classOf(market)], f, y, attr, o.mainMin, cur[classOf(market)]);
    }
    cur = { line: readAcc(A.line, o), prop: readAcc(A.prop, o) };
    months.push([m, cur]);
  }
  while (i < sorted.length) {
    const [, market, , f, y, attr] = sorted[i++];
    addRow(A[classOf(market)], f, y, attr, o.mainMin, cur[classOf(market)]);
  }
  const final = { line: readAcc(A.line, o), prop: readAcc(A.prop, o) };
  const at = (t, cls) => {
    let lo = 0;
    let hi = months.length - 1;
    let best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (months[mid][0] <= t) (best = months[mid][1]), (lo = mid + 1);
      else hi = mid - 1;
    }
    return best?.[cls] ?? {};
  };
  return { at, months, final };
}

// A bet's trusted edge and the pieces that carried it: { te, pieces: [[key, part]] (its proven pieces' trusted parts,
// largest first, the positive ones) }
export function trustedEdge(attr, rel) {
  let te = 0;
  const pieces = [];
  for (const [k, v] of Object.entries(attr ?? {})) {
    const w = rel?.[k]?.w ?? 0;
    if (!w || !fin(v)) continue;
    te += v * w;
    if (v * w > 0) pieces.push([k, v * w]);
  }
  pieces.sort((a, b) => b[1] - a[1]);
  return { te, pieces };
}

// (the rule's score: the trusted edge, or the trusted edge times the Kelly score)
// (or 'share': the share of the bet's whole edge its proven pieces carry, "hits those pieces to a certain degree")
const scoreOf = (rule, te, kelly, edge) => (rule.score === 'teKelly' ? te * Math.max(0, kelly) : rule.score === 'share' ? (edge > 0 ? te / edge : 0) : te);

// The bands on bets (each { t, at, market, kelly, attr, units, suspect, barred }): rule { bars: 'abs' | 'pct', love,
// lock (absolute trusted edge, or the top shares: lock 0.05 the top 5%, love 0.20 the top 20% with the LOCKs), kelly
// (the floor under both), lockKelly (LOCK's own floor), score ('te' | 'teKelly'), minPrior (bets settled before
// needed to read a percentile) }; walk from walkTrust. Returns each bet's { band, te, pieces }
export function trustBands(bets, walk, rule) {
  const order = bets.map((b, i) => i).sort((a, b) => bets[a].at - bets[b].at);
  const settled = [];
  const out = new Array(bets.length);
  // (the prior bets' scores by settle time, read each bet's month so a percentile is the months before only)
  const done = bets.map((b) => b.t + GAME_HOURS * 36e5);
  const bySettle = bets.map((b, i) => i).sort((a, b) => done[a] - done[b]);
  let s = 0;
  let cache = { n: -1, sorted: [] };
  const scores = bets.map((b) => {
    const { te, pieces } = trustedEdge(b.attr, walk.at(b.at, classOf(b.market)));
    const edge = Object.values(b.attr ?? {}).reduce((a, v) => a + (fin(v) ? v : 0), 0);
    return { te, pieces, score: scoreOf(rule, te, b.kelly, edge) };
  });
  for (const i of order) {
    const b = bets[i];
    const m = MONTH(b.at);
    while (s < bySettle.length && done[bySettle[s]] < m) {
      const j = bySettle[s++];
      // (the pool: every bet settled before the month (the pyramid's shares are of all the bets), its score)
      if (bets[j].kelly > 0) settled.push(scores[j].score);
    }
    const { te, pieces, score } = scores[i];
    let band = 'medium';
    const kOk = fin(b.kelly) && b.kelly >= (rule.kelly ?? 0.02);
    if (kOk && te > 0) {
      if (rule.bars === 'pct') {
        if (settled.length >= (rule.minPrior ?? 200)) {
          if (cache.n !== settled.length) cache = { n: settled.length, sorted: [...settled].sort((a, c) => c - a) };
          const { sorted } = cache;
          const q = (share) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(share * sorted.length) - 1))];
          if (rule.lock > 0 && score >= q(rule.lock) && b.kelly >= (rule.lockKelly ?? rule.kelly ?? 0.02)) band = 'lock';
          else if (score >= q(rule.love)) band = 'high';
        }
      } else if (rule.lock > 0 && scores[i].score >= rule.lock && b.kelly >= (rule.lockKelly ?? rule.kelly ?? 0.02)) band = 'lock';
      else if (scores[i].score >= rule.love) band = 'high';
    }
    if ((b.suspect || b.barred) && band !== 'medium') band = 'medium';
    out[i] = { band, te, pieces };
  }
  return out;
}

// The popover's words: "Driven by: rest edge (proven), matchup vs position (proven)"
export const drivenBy = (pieces, cls) => (pieces?.length ? `Driven by: ${pieces.slice(0, 3).map(([k]) => `${pieceName(k, cls)} (proven)`).join(', ')}` : null);
