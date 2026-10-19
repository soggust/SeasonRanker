// The replay gate's measures (gate.mjs: champion against challenger, the owner's rule of 2026-10-18): every number
// the gate decides on, as pure functions of the rows two versions of the model scored on the same history. The
// versions own their chances; this file owns how they're judged, so both are judged one way whatever either's code.
//
//   eras      ERAS: each sport's rule era, the season it starts (ESPN's season labels: the NBA's and the NHL's the
//             year a season ends). A season before it is the old game: in the sanity set only, never deciding
//   weights   a season's weight halves each season back (DECAY); the deciding set is the current season and the
//             DECIDE - 1 before it inside the era; the rest (older seasons, or before the era) the sanity set at
//             SANITY_W of their decayed weight, which can flag a change but never decide it
//   noise     every comparison a difference of two ratio means (the candidate's less the champion's), its interval
//             from a bootstrap over clusters (a day's games, a slate, a game's props: rows that move together),
//             seeded, so a run again reads the same. Worse beyond noise: the 95% interval wholly on the worse side
//   rule      SHIP when, in every sport with rows, the projections' deciding sets are not worse beyond noise
//             (layer a) and the betting layer's deciding measures (log loss on the results, log loss against the
//             close, the top picks' CLV) are not worse beyond noise (layer b: beats or ties). The rest reported

export const ERAS = {
  // (the 2024 kickoff: the dynamic kickoff, NFL Football Operations' 2024 rule changes, adopted March 26, 2024;
  // returns went from 22% of kickoffs in 2023 to 33% in 2024 and starting field position moved with them)
  nfl: { start: 2024, why: 'the dynamic kickoff (NFL Football Operations, 2024 rule changes)' },
  // (the 2023 season: the pitch clock, the shift restrictions and the bigger bases, MLB's announcement of
  // September 9, 2022; game times fell about 24 minutes, stolen-base attempts and batting average on balls in
  // play rose)
  mlb: { start: 2023, why: 'the pitch clock, the shift ban and the bigger bases (MLB, September 9, 2022)' },
  // (the three-point era: 2016-17, ESPN's 2017, the season the league's threes tried a game jumped most (24.1 to
  // 27.0, Basketball-Reference's league averages) and have never fallen back since)
  nba: { start: 2017, why: "the three-point era: 2016-17's jump in threes tried a game (Basketball-Reference league averages)" },
  // (post-2005 rules: 2005-06, ESPN's 2006, the lockout's rule changes (the red line out of two-line passes, the
  // obstruction crackdown, the shootout); the data starts 2009 where it has history that far)
  nhl: { start: 2006, why: 'the post-lockout rules of 2005-06 (two-line pass, obstruction, the shootout)' },
};
export const DECAY = 0.5;
export const DECIDE = 3;
export const SANITY_W = 0.1;
export const BOOT = 1000;
export const SEED = 20261018;

const fin = Number.isFinite;
export const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const clip = (p) => Math.min(0.995, Math.max(0.005, p));
export const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

// A season's place: { w, decides } (w 0: out). current: the sport's latest season with finals
export function seasonWeight(sport, season, current) {
  if (!fin(season) || !fin(current)) return { w: 0, decides: false };
  const back = current - season;
  if (back < 0) return { w: 0, decides: false };
  const era = ERAS[sport]?.start ?? -Infinity;
  const w = Math.pow(DECAY, back);
  const decides = season >= era && back < DECIDE;
  return { w: decides ? w : w * SANITY_W, decides };
}

// (a seeded generator: mulberry32)
export function rng(seed = SEED) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The difference of two ratio means over clusters, B's less A's: each cluster { wA, sA, wB, sB } (the weights and
// the weighted sums of its rows' values, each version's); paired rows give a cluster the same weights twice. The
// point estimate and its bootstrap interval (2.5% and 97.5%), the standard error, n (the clusters).
// { n, a, b, diff, lo, hi, se } or null with no weight on either side
export function bootDiff(clusters, { boot = BOOT, seed = SEED } = {}) {
  const cs = clusters.filter((c) => c.wA > 0 || c.wB > 0);
  const tot = (list) => list.reduce((t, c) => ((t.wA += c.wA), (t.sA += c.sA), (t.wB += c.wB), (t.sB += c.sB), t), { wA: 0, sA: 0, wB: 0, sB: 0 });
  const all = tot(cs);
  if (!(all.wA > 0) || !(all.wB > 0)) return null;
  const a = all.sA / all.wA;
  const b = all.sB / all.wB;
  const diff = b - a;
  const draws = [];
  const next = rng(seed);
  const k = cs.length;
  for (let i = 0; i < boot; i++) {
    let wA = 0;
    let sA = 0;
    let wB = 0;
    let sB = 0;
    for (let j = 0; j < k; j++) {
      const c = cs[Math.floor(next() * k)];
      wA += c.wA;
      sA += c.sA;
      wB += c.wB;
      sB += c.sB;
    }
    if (wA > 0 && wB > 0) draws.push(sB / wB - sA / wA);
  }
  draws.sort((x, y) => x - y);
  const q = (p) => (draws.length ? draws[Math.min(draws.length - 1, Math.max(0, Math.round(p * (draws.length - 1))))] : diff);
  const m = draws.reduce((t, x) => t + x, 0) / Math.max(1, draws.length);
  const se = Math.sqrt(draws.reduce((t, x) => t + (x - m) * (x - m), 0) / Math.max(1, draws.length - 1));
  return { n: k, a: r4(a), b: r4(b), diff: r4(diff), lo: r4(q(0.025)), hi: r4(q(0.975)), se: r4(se) };
}

// A comparison's word, lower better (a loss) unless higher: 'better', 'worse' (beyond noise: the interval wholly
// on one side) or 'tie'; none: 'n/a'
export function verdictOf(cmp, { higher = false } = {}) {
  if (!cmp) return 'n/a';
  const lo = higher ? -cmp.hi : cmp.lo;
  const hi = higher ? -cmp.lo : cmp.hi;
  if (lo > 0) return 'worse';
  if (hi < 0) return 'better';
  return 'tie';
}

// Rows of two versions paired by key into clusters: rows { k, c, w, v } each (k the row's key, c its cluster, w its
// weight, v its value); only keys both have. { clusters, n, onlyA, onlyB }
export function pairRows(rowsA, rowsB) {
  const byB = new Map(rowsB.map((r) => [r.k, r]));
  const cl = new Map();
  let n = 0;
  const seen = new Set();
  for (const ra of rowsA) {
    const rb = byB.get(ra.k);
    if (!rb || !fin(ra.v) || !fin(rb.v)) continue;
    seen.add(ra.k);
    const w = ra.w ?? 1;
    if (!(w > 0)) continue;
    n++;
    const c = cl.get(ra.c) ?? { wA: 0, sA: 0, wB: 0, sB: 0 };
    c.wA += w;
    c.sA += w * ra.v;
    c.wB += w;
    c.sB += w * rb.v;
    cl.set(ra.c, c);
  }
  return { clusters: [...cl.values()], n, onlyA: rowsA.length - seen.size, onlyB: rowsB.filter((r) => !seen.has(r.k)).length };
}

// Two versions' rows (each { c, w, v }), unpaired, into clusters by c: a slate's picks, which the versions choose
// apart
export function clusterRows(rowsA, rowsB) {
  const cl = new Map();
  const put = (r, side) => {
    if (!fin(r.v)) return;
    const w = r.w ?? 1;
    const c = cl.get(r.c) ?? { wA: 0, sA: 0, wB: 0, sB: 0 };
    c[`w${side}`] += w;
    c[`s${side}`] += w * r.v;
    cl.set(r.c, c);
  };
  for (const r of rowsA) put(r, 'A');
  for (const r of rowsB) put(r, 'B');
  return [...cl.values()];
}

// ---- the projections (layer a), price-free ----

// A normal's log score (nats, lower better) and its CRPS (closed form) at an outcome
export function normalLoss(x, mu, sigma) {
  if (!fin(x) || !fin(mu) || !(sigma > 0)) return null;
  const z = (x - mu) / sigma;
  return 0.5 * z * z + Math.log(sigma) + LOG_SQRT_2PI;
}
const phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
// (the standard normal's CDF: Abramowitz and Stegun 7.1.26 on erf, error under 1.5e-7)
export function Phi(z) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
export function normalCrps(x, mu, sigma) {
  if (!fin(x) || !fin(mu) || !(sigma > 0)) return null;
  const z = (x - mu) / sigma;
  return sigma * (z * (2 * Phi(z) - 1) + 2 * phi(z) - 1 / Math.sqrt(Math.PI));
}
// (a binary log loss, the chance of what happened)
export const binLoss = (p, y) => (fin(p) && (y === 0 || y === 1) ? -Math.log(clip(y ? p : 1 - p)) : null);
// (a soft label's: the cross-entropy of a chance against the close's q)
export const softLoss = (p, q) => (fin(p) && fin(q) ? -(q * Math.log(clip(p)) + (1 - q) * Math.log(clip(1 - p))) : null);

// A projection layer's comparison: each version's rows { k, c (a day), season, v (a loss), elig? }; the deciding set
// and the sanity set, each weighted by its season (seasonWeight), paired by key. { decide, sanity, current, n }
export function projCompare(sport, rowsA, rowsB, current, opts = {}) {
  const wOf = (r) => seasonWeight(sport, r.season, current);
  const part = (decides) => {
    const pick = (rows) => rows.filter((r) => wOf(r).w > 0 && wOf(r).decides === decides).map((r) => ({ ...r, w: wOf(r).w }));
    const p = pairRows(pick(rowsA), pick(rowsB));
    const cmp = bootDiff(p.clusters, opts);
    return cmp ? { ...cmp, rows: p.n, verdict: verdictOf(cmp) } : { rows: 0, verdict: 'n/a' };
  };
  return { current, decide: part(true), sanity: part(false) };
}

// ---- the betting layer: every row with a saved price ----
//
// A priced row in the over's frame (gate.mjs makes them): { id, event, sport, day (US Eastern, the slate), t, f
// (the book's no-vig over), p (the version's priced over), y (the over won: 1, 0; a push null), q (the close's
// no-vig over at the row's line, or null), overOdds, underOdds, stat }. A side: 'over' or 'under' (a game line's
// row framed the same, its own side the 'over')

const sideOf = (x, side) => ({ p: side === 'over' ? x.p : 1 - x.p, f: side === 'over' ? x.f : 1 - x.f, y: x.y === null ? null : side === 'over' ? x.y : 1 - x.y, q: x.q === null || x.q === undefined ? null : side === 'over' ? x.q : 1 - x.q, odds: side === 'over' ? x.overOdds : x.underOdds });
const priceOf = (o) => (fin(o) && o ? o : -110);
// (a side priced: a prop's two (one missing its price at -110, as the desk assumes), a game line's own side only:
// its other is null)
const hasOdds = (x, side) => (side === 'over' ? x.overOdds : x.underOdds) !== null;

// A pick's result at a stake: { won, profit (per unit), clv (the close's chance at its own price, less 1) }
export function gradeSide(x, side) {
  const s = sideOf(x, side);
  const d = dec(priceOf(s.odds));
  return { won: s.y, profit: s.y === null ? 0 : s.y ? d - 1 : -1, clv: s.q === null ? null : s.q * d - 1, p: s.p, f: s.f, d };
}

// Each slate's best n by edge before the vig (the practice picks, desk.mjs PRACTICE_N): every row at its better
// side by the version's chance over the book's, the n with the most edge (an edge over 0)
export function topPicks(rows, n) {
  const slates = new Map();
  for (const x of rows) slates.set(x.day, [...(slates.get(x.day) ?? []), x]);
  const out = [];
  for (const [day, list] of slates) {
    const scored = list
      .map((x) => {
        const over = x.p - x.f >= x.f - x.p;
        const side = over ? 'over' : 'under';
        return { x, side, edge: over ? x.p - x.f : x.f - x.p, day };
      })
      // (a side with no saved price (a game line's other side) never picked)
      .filter((s) => s.edge > 0 && hasOdds(s.x, s.side))
      .sort((a, b) => b.edge - a.edge || String(a.x.id).localeCompare(String(b.x.id)));
    out.push(...scored.slice(0, n));
  }
  return out;
}

// The edge picks at the real stakes: each row's better side where its expected return at its own price is over 0,
// staked by stakeOf(ev, odds) (the desk's table)
export function edgePicks(rows, stakeOf) {
  const out = [];
  for (const x of rows) {
    for (const side of ['over', 'under']) {
      if (!hasOdds(x, side)) continue;
      const g = gradeSide(x, side);
      const ev = g.p * g.d - 1;
      if (ev > 0) {
        const units = stakeOf(ev, priceOf(side === 'over' ? x.overOdds : x.underOdds), x, side);
        if (units > 0) out.push({ x, side, ev, units, day: x.day });
      }
    }
  }
  return out;
}

// One version's betting numbers on its rows: the log loss on the results of its chance and the book's (gap: the
// model's less the book's, under 0 the model better), against the close the same, the top picks' (n a slate) hit
// rate, CLV and units at the practice stake, the edge picks' at the real stakes
export function betSummary(rows, { n = 6, practice = 0.5, stakeOf = () => 1 } = {}) {
  const dec_ = rows.filter((x) => x.y === 0 || x.y === 1);
  const closed = rows.filter((x) => fin(x.q));
  const mean = (list, f) => (list.length ? list.reduce((t, x) => t + f(x), 0) / list.length : null);
  const ll = mean(dec_, (x) => binLoss(x.p, x.y));
  const llBook = mean(dec_, (x) => binLoss(x.f, x.y));
  const lc = mean(closed, (x) => softLoss(x.p, x.q));
  const lcBook = mean(closed, (x) => softLoss(x.f, x.q));
  const top = topPicks(rows, n).map((s) => ({ ...s, g: gradeSide(s.x, s.side) }));
  const topDec = top.filter((s) => s.g.won !== null);
  const topClv = top.filter((s) => fin(s.g.clv));
  const edge = edgePicks(rows, stakeOf).map((s) => ({ ...s, g: gradeSide(s.x, s.side) }));
  const edgeDec = edge.filter((s) => s.g.won !== null);
  const staked = edgeDec.reduce((t, s) => t + s.units, 0);
  return {
    rows: rows.length,
    decided: dec_.length,
    closed: closed.length,
    logLoss: r4(ll),
    book: r4(llBook),
    gap: fin(ll) && fin(llBook) ? r4(ll - llBook) : null,
    closeLoss: r4(lc),
    closeBook: r4(lcBook),
    closeGap: fin(lc) && fin(lcBook) ? r4(lc - lcBook) : null,
    top: { n: top.length, hit: topDec.length ? r4(topDec.filter((s) => s.g.won).length / topDec.length) : null, clv: topClv.length ? r4(mean(topClv, (s) => s.g.clv)) : null, units: r4(topDec.reduce((t, s) => t + practice * s.g.profit, 0)), staked: r4(topDec.length * practice) },
    edge: { n: edge.length, hit: edgeDec.length ? r4(edgeDec.filter((s) => s.g.won).length / edgeDec.length) : null, clv: edge.filter((s) => fin(s.g.clv)).length ? r4(mean(edge.filter((s) => fin(s.g.clv)), (s) => s.g.clv)) : null, units: r4(edgeDec.reduce((t, s) => t + s.units * s.g.profit, 0)), staked: r4(staked), roi: staked > 0 ? r4(edgeDec.reduce((t, s) => t + s.units * s.g.profit, 0) / staked) : null },
  };
}

// The betting layer's comparison of two versions on the same priced rows (paired by id; a row's cluster its game):
// the log loss on the results (ll) and against the close (close), paired; the top picks' CLV and hit rate, and the
// edge picks' units, by slate. Deciding: ll, close and topClv
export const BET_DECIDE = ['ll', 'close', 'topClv'];
export function betCompare(rowsA, rowsB, { n = 6, practice = 0.5, stakeOf = () => 1, ...opts } = {}) {
  const lossRows = (rows, f) => rows.map((x) => ({ k: x.id, c: x.event, v: f(x) })).filter((r) => fin(r.v));
  const pairOn = (f) => {
    const p = pairRows(lossRows(rowsA, f), lossRows(rowsB, f));
    const cmp = bootDiff(p.clusters, opts);
    return cmp ? { ...cmp, rows: p.n } : null;
  };
  const ll = pairOn((x) => (x.y === 0 || x.y === 1 ? binLoss(x.p, x.y) : null));
  const close = pairOn((x) => (fin(x.q) ? softLoss(x.p, x.q) : null));
  const picks = (rows) => topPicks(rows, n).map((s) => ({ s, g: gradeSide(s.x, s.side) }));
  const pa = picks(rowsA);
  const pb = picks(rowsB);
  const slateCmp = (f) => {
    const cmp = bootDiff(clusterRows(pa.map(({ s, g }) => ({ c: s.day, v: f(g) })), pb.map(({ s, g }) => ({ c: s.day, v: f(g) }))), opts);
    return cmp;
  };
  const topClv = slateCmp((g) => g.clv);
  const topHit = slateCmp((g) => (g.won === null ? null : g.won ? 1 : 0));
  const ea = edgePicks(rowsA, stakeOf).map((s) => ({ s, g: gradeSide(s.x, s.side) }));
  const eb = edgePicks(rowsB, stakeOf).map((s) => ({ s, g: gradeSide(s.x, s.side) }));
  // (units a slate: each slate's sum, a cluster's weight 1 a side so the ratio is the mean a slate)
  const unitsBy = (list) => {
    const m = new Map();
    for (const { s, g } of list) m.set(s.day, (m.get(s.day) ?? 0) + s.units * g.profit);
    return m;
  };
  const ua = unitsBy(ea);
  const ub = unitsBy(eb);
  const days = new Set([...rowsA.map((x) => x.day), ...rowsB.map((x) => x.day)]);
  const units = bootDiff([...days].map((d) => ({ wA: 1, sA: ua.get(d) ?? 0, wB: 1, sB: ub.get(d) ?? 0 })), opts);
  const out = {
    ll: ll && { ...ll, verdict: verdictOf(ll) },
    close: close && { ...close, verdict: verdictOf(close) },
    topClv: topClv && { ...topClv, verdict: verdictOf(topClv, { higher: true }) },
    topHit: topHit && { ...topHit, verdict: verdictOf(topHit, { higher: true }) },
    units: units && { ...units, verdict: verdictOf(units, { higher: true }) },
  };
  return out;
}

// One sport's verdict from its layers: { pass, beats, why[] }. proj: { games?, props? } (projCompare's), bet: {
// props?, lines? } (betCompare's). A layer with no rows says nothing; a sanity set worse beyond noise a flag only
export function sportVerdict({ proj = {}, bet = {} }) {
  const why = [];
  const flags = [];
  let pass = true;
  let beats = false;
  let any = false;
  for (const [layer, c] of Object.entries(proj)) {
    if (!c) continue;
    if (c.decide?.verdict && c.decide.verdict !== 'n/a') any = true;
    if (c.decide?.verdict === 'worse') (pass = false), why.push(`${layer} projections worse beyond noise (${c.decide.diff > 0 ? '+' : ''}${c.decide.diff} a row, 95% ${c.decide.lo} to ${c.decide.hi})`);
    if (c.decide?.verdict === 'better') beats = true;
    if (c.sanity?.verdict === 'worse') flags.push(`${layer} projections' older seasons worse (${c.sanity.diff}): a flag, not deciding`);
  }
  for (const [layer, c] of Object.entries(bet)) {
    if (!c) continue;
    for (const m of BET_DECIDE) {
      const v = c[m]?.verdict;
      if (!v || v === 'n/a') continue;
      any = true;
      if (v === 'worse') (pass = false), why.push(`${layer} ${m} worse beyond noise (${c[m].diff > 0 ? '+' : ''}${c[m].diff}, 95% ${c[m].lo} to ${c[m].hi})`);
      if (v === 'better') beats = true;
    }
  }
  return { pass, beats: pass && beats, any, why, flags };
}

// The whole gate's verdict over the sports: SHIP (every sport passes; BEATS where one is better beyond noise and
// none worse), HOLD (one fails), or NO DATA
export function gateVerdict(bySport) {
  const sports = Object.entries(bySport).filter(([, v]) => v?.any);
  if (!sports.length) return { verdict: 'NO DATA', why: ['no sport had rows both versions scored'] };
  const failed = sports.filter(([, v]) => !v.pass);
  if (failed.length) return { verdict: 'HOLD', why: failed.flatMap(([s, v]) => v.why.map((w) => `${s}: ${w}`)) };
  const better = sports.filter(([, v]) => v.beats).map(([s]) => s);
  return { verdict: 'SHIP', beats: better, why: better.length ? [`better beyond noise in ${better.join(', ')}; no layer worse`] : ['ties everywhere: no layer worse'] };
}
