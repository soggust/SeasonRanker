// The weekly leak hunt (the self-check's C23; the owner's rule of 2026-10-18 with the replay gate, gate.mjs): the
// priced history replayed against the book, segment by segment, for where the desk loses to it with enough
// evidence to say so. Free: the ledger alone, no network, no AI. It changes nothing: each leak is a candidate fix,
// and a fix ships only through the gate.
//
//   rows      every graded row with a saved price (bets and tracked rows, props and game lines; a void out): its
//             priced chance on its side (p, as placed), the book's no-vig (fair), the result, the close's no-vig
//             chance at its line (clv.q)
//   gain      a row's log loss gain over the book (nats, over 0 the desk better): on the result, ln(chance of what
//             happened at p) less the same at fair; against the close, the cross-entropy at fair less at p; half
//             each where it has both. A game's rows share their weight (1 / (1 + (n - 1) RHO)), as the fits do
//   segments  the sport's every row, then one way by each dimension (DIMS: the stat or market, the line's size, the side, the team, the price,
//             the placement's timing), and two way by the stat with the side and with the line's size
//   evidence  a segment's mean gain, its standard error from its games (clustered), z and a one-sided p for losing;
//             tested only from LEAK_N rows in LEAK_GAMES games (a segment with the same rows as one before it,
//             a stat's and its one line size's, tested once); the leaks those passing Benjamini-Hochberg's false discovery rate at
//             LEAK_FDR across every segment tested (so one sport's 60 cells don't make 3 leaks by chance), and its
//             shrunk mean (n / (n + LEAK_K) of its own) under 0
//   trend     a segment's last 7 days against its weeks before (from TREND_N rows each, in 3 games this week and
//             LEAK_GAMES / 2 before): worse by more than
//             TREND_Z standard errors, a watch whether or not it's a leak yet
//   at risk   the units the desk staked in the segment in the last 28 days (its bets': what the leak costs if it's
//             real); the leaks ranked by it, then by the shrunk loss
//   causes    the miss review's (miss-review.mjs: why the biggest misses missed) of the segment's own reviewed
//             misses, else its stat's recurring ones (the review's tally)
//   fix       each leak a candidate fix in words, by the kind of segment, with the gate to pass before it ships

import { lineBucket } from './desk.mjs';

export const LEAK_N = 40;
// (and its games: a team's 60 rows from 4 games are 4 pieces of evidence, not 60)
export const LEAK_GAMES = 8;
export const LEAK_FDR = 0.1;
export const LEAK_K = 100;
export const TREND_N = 20;
export const TREND_Z = 2;
export const RISK_DAYS = 28;
const RHO = 0.3;
const DAY = 864e5;
const fin = Number.isFinite;
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const clip = (p) => Math.min(0.995, Math.max(0.005, p));
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));

const priceBin = (odds) => (!fin(odds) || !odds ? null : odds <= -125 ? 'favorite' : odds >= 115 ? 'dog' : 'near even');
const timingBin = (h) => (!fin(h) ? null : h < 2 ? 'under 2h' : h < 8 ? '2-8h' : '8h+');
const marketOf = (b) => (b.market === 'prop' ? b.statLabel ?? b.propType : { spread: 'Spreads', total: 'Totals', ml: 'Moneylines' }[b.market] ?? b.market);
const teamOf = (b, teams) => {
  if (b.market === 'prop') return teams?.[String(b.team)] ?? (b.team ? String(b.team) : null);
  const [away, home] = String(b.matchup ?? '').split(' @ ');
  return b.side === 'home' ? home ?? null : b.side === 'away' ? away ?? null : null;
};

// The dimensions a row is segmented by: name, its level (null: not in it)
export const DIMS = {
  // (the sport's every row: a sport losing to the book everywhere is one leak, not a dozen)
  all: () => 'every row',
  stat: (b) => marketOf(b),
  line: (b) => (b.market === 'prop' ? `${lineBucket(b.line)} line` : null),
  side: (b) => b.side ?? null,
  team: (b, teams) => teamOf(b, teams),
  price: (b) => priceBin(b.odds),
  timing: (b) => timingBin((Date.parse(b.start) - Date.parse(b.placedAt ?? b.start)) / 36e5),
  'stat+side': (b) => (b.side ? `${marketOf(b)} ${b.side}` : null),
  'stat+line': (b) => (b.market === 'prop' ? `${marketOf(b)} ${lineBucket(b.line)} line` : null),
};

// The priced history's rows (gate-history.mjs: a version's open rows, its priced chance against the open's no-vig,
// the close's chance at the same line, the result; every season since 2020, its season's weight w) as the hunt reads
// a bet: on the side the version leans, staked 0 (never bet: nothing at risk), weight w. The gate writes the hunt
// on them with each --record (apps/<sport>/src/StaticData/model/history-leaks.json), which C23 reports beside the
// ledger's (DECISIONS.md D22, D29)
export function historyLeakBets(rows) {
  const out = [];
  for (const x of rows ?? []) {
    if (!fin(x.p) || !fin(x.f)) continue;
    const over = x.p >= x.f;
    const prop = x.stat !== 'ml' && x.stat !== 'spread' && x.stat !== 'total';
    const side = over ? (prop || x.stat === 'total' ? 'over' : 'home') : prop || x.stat === 'total' ? 'under' : 'away';
    const y = x.y === null || x.y === undefined ? null : over ? x.y : 1 - x.y;
    out.push({
      id: x.id,
      event: x.event,
      market: prop ? 'prop' : x.stat,
      propType: prop ? x.stat : undefined,
      line: x.line,
      side,
      odds: over ? x.overOdds : x.underOdds,
      p: over ? x.p : 1 - x.p,
      fair: over ? x.f : 1 - x.f,
      status: y === 1 ? 'won' : y === 0 ? 'lost' : 'push',
      ...(fin(x.q) ? { clv: { q: over ? x.q : 1 - x.q } } : {}),
      start: new Date(x.t).toISOString(),
      units: 0,
      intent: 'track',
      weight: fin(x.w) ? x.w : 1,
    });
  }
  return out;
}

// A row's gain over the book (gain: see the header) and its parts: { gain, result, close } or null with neither
export function rowGain(b) {
  if (!fin(b.p) || !fin(b.fair)) return null;
  const won = b.status === 'won' ? 1 : b.status === 'lost' ? 0 : null;
  const q = fin(b.clv?.q) ? b.clv.q : null;
  const res = won === null ? null : Math.log(clip(won ? b.p : 1 - b.p)) - Math.log(clip(won ? b.fair : 1 - b.fair));
  const ce = (x) => -(q * Math.log(clip(x)) + (1 - q) * Math.log(clip(1 - x)));
  const close = q === null ? null : ce(b.fair) - ce(b.p);
  if (res === null && close === null) return null;
  const gain = res !== null && close !== null ? 0.5 * res + 0.5 * close : (res ?? close);
  return { gain, result: res, close };
}

// The rows the hunt reads: graded or closed, priced, not void: { b, g, w, t, event, units, clv, day }
export function leakRows(bets) {
  const rows = (bets ?? []).filter((b) => b && !b.void && (b.status === 'won' || b.status === 'lost' || b.status === 'push' || fin(b.clv?.q)) && b.status !== 'open' && b.status !== 'void');
  const perGame = new Map();
  for (const b of rows) perGame.set(String(b.event ?? b.id), (perGame.get(String(b.event ?? b.id)) ?? 0) + 1);
  const out = [];
  for (const b of rows) {
    const g = rowGain(b);
    if (!g) continue;
    const ev = String(b.event ?? b.id);
    const t = Date.parse(b.start);
    out.push({ b, g: g.gain, w: (fin(b.weight) ? b.weight : 1) / (1 + ((perGame.get(ev) ?? 1) - 1) * RHO), t, day: etDay(t), event: ev, units: b.intent === 'track' ? 0 : fin(b.units) ? b.units : 0, clv: fin(b.clv?.ev) ? b.clv.ev : null });
  }
  return out;
}

// A list's weighted mean gain and its standard error, clustered by game: { n, games, mean, se, z, clv }
export function meanOf(list) {
  let W = 0;
  let S = 0;
  for (const x of list) (W += x.w), (S += x.w * x.g);
  if (!(W > 0)) return { n: list.length, games: 0, mean: null, se: null, z: null };
  const mean = S / W;
  const byGame = new Map();
  for (const x of list) byGame.set(x.event, (byGame.get(x.event) ?? 0) + x.w * (x.g - mean));
  const G = byGame.size;
  let V = 0;
  for (const v of byGame.values()) V += v * v;
  const se = G > 1 ? Math.sqrt((G / (G - 1)) * V) / W : null;
  const clvs = list.filter((x) => fin(x.clv));
  return { n: list.length, games: G, mean, se, z: se > 0 ? mean / se : null, clv: clvs.length ? clvs.reduce((t, x) => t + x.clv, 0) / clvs.length : null };
}

// (the normal's tail: one-sided p for a z under 0)
function lowerP(z) {
  if (!fin(z)) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z < 0 ? tail : 1 - tail;
}

// Benjamini-Hochberg: the tested ones' p-values, the ones discovered at q (a Set of their indices)
export function bhDiscoveries(ps, q = LEAK_FDR) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const m = order.length;
  let k = -1;
  order.forEach(([p], j) => {
    if (p <= ((j + 1) / m) * q) k = j;
  });
  return new Set(order.slice(0, k + 1).map(([, i]) => i));
}

// The miss review's causes for a segment: its own reviewed misses' (matched by the pick and the matchup, the
// review's day within a day of the game's), else its stat's tally. [{ cause, n, share }] and where they're from
function causesOf(rows, reviews, tally, sport, statLabel) {
  const byPick = new Map();
  for (const r of reviews ?? []) {
    const k = `${r.pick}|${r.matchup}`;
    byPick.set(k, [...(byPick.get(k) ?? []), r]);
  }
  const counts = new Map();
  let n = 0;
  for (const x of rows) {
    for (const r of byPick.get(`${x.b.pick}|${x.b.matchup}`) ?? []) {
      if (Math.abs(Date.parse(r.day) - Date.parse(x.day)) > DAY + 1) continue;
      counts.set(r.cause, (counts.get(r.cause) ?? 0) + 1);
      n++;
    }
  }
  if (n) return { from: 'its reviewed misses', n, causes: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cause, k]) => ({ cause, n: k, share: r4(k / n) })) };
  const mine = (tally ?? []).filter((t) => t.sport === sport && (!statLabel || t.stat === statLabel));
  if (!mine.length) return null;
  const tot = mine.reduce((t, x) => t + (x.n ?? 0), 0);
  const by = new Map();
  for (const t of mine) by.set(t.cause, (by.get(t.cause) ?? 0) + (t.n ?? 0));
  return { from: statLabel ? `the review's ${statLabel} tally` : "the review's tally", n: tot, causes: [...by].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cause, k]) => ({ cause, n: k, share: tot ? r4(k / tot) : null })) };
}

// A leak's candidate fix in words: by its segment's kind, and its top cause where the review has one
export function fixOf(dim, level, causes) {
  const top = causes?.causes?.[0]?.cause;
  const base = {
    all: "the sport's pricing as a whole: the correction's sport term and the trust it's sized by (correct.mjs, desk.mjs fitTrust), before any one segment",
    stat: `the projection or the correction for ${level}: its own bias (project.mjs fitStat) or the correction's sport|stat term (correct.mjs)`,
    line: `the correction's line-size term at ${level}s (correct.mjs sport|bucket) or the count's spread there (project.mjs rAt)`,
    side: `the lean to the ${level} (correct.mjs dir terms; the projection's bias by side)`,
    team: `${level}'s data: its roster, injuries and depth as the feeds read them, then an opponent term`,
    price: `the ${level} prices (correct.mjs price term; the Book's no-vig at that price, fairPair)`,
    timing: `the placement timing (leagues.mjs TIMING): bets placed ${level} before the start`,
    'stat+side': `the correction's ${level} lean (correct.mjs sport|stat|bucket|dir)`,
    'stat+line': `the correction's ${level} term (correct.mjs sport|stat|bucket) or the stat's spread at small counts`,
  }[dim];
  const why = top === 'data' ? ' (the misses there read as data: the feed first)' : top === 'role' ? ' (the misses there read as role changes: the role terms first)' : top === 'variance' ? ' (the misses there read as variance: watch it a week before fixing)' : top ? ` (the misses there read as ${top})` : '';
  return `${base}${why}; ships only through the gate (node libs/ranker/scripts/model/gate.mjs --candidate <the fix>)`;
}

// The hunt over a sport's ledger: { rows (the ranked leaks and trends), tested, discovered, n, status, headline }.
// now: the time it runs; teams: id to abbreviation; review: the miss review's file ({ reviews, tally })
export function huntLeaks(bets, { sport, now = new Date(), teams = {}, review = null } = {}) {
  const rows = leakRows(bets);
  const to = now.getTime();
  const weekFrom = to - 7 * DAY;
  const riskFrom = to - RISK_DAYS * DAY;
  const segs = new Map();
  for (const x of rows) {
    if (x.t > to) continue;
    for (const [dim, f] of Object.entries(DIMS)) {
      const level = f(x.b, teams);
      if (level === null || level === undefined || level === '') continue;
      const key = `${dim}=${level}`;
      const s = segs.get(key) ?? { dim, level, rows: [] };
      s.rows.push(x);
      segs.set(key, s);
    }
  }
  const tested = [];
  const trends = [];
  const sigs = new Set();
  for (const s of segs.values()) {
    const all = meanOf(s.rows);
    const week = s.rows.filter((x) => x.t >= weekFrom);
    const before = s.rows.filter((x) => x.t < weekFrom);
    const wk = meanOf(week);
    const bf = meanOf(before);
    const atRisk = s.rows.filter((x) => x.t >= riskFrom).reduce((t, x) => t + x.units, 0);
    const shrunk = fin(all.mean) ? (all.n / (all.n + LEAK_K)) * all.mean : null;
    const seg = { ...s, all, wk, bf, atRisk, shrunk };
    // (the same rows as a segment already read: once)
    const sig = `${all.n}|${all.games}|${all.mean}`;
    if (sigs.has(sig)) continue;
    sigs.add(sig);
    if (all.n >= LEAK_N && all.games >= LEAK_GAMES && fin(all.z)) tested.push({ ...seg, p: lowerP(all.z) });
    if (wk.n >= TREND_N && bf.n >= TREND_N && wk.games >= 3 && bf.games >= LEAK_GAMES / 2 && fin(wk.se) && fin(bf.se)) {
      const dz = (wk.mean - bf.mean) / Math.sqrt(wk.se * wk.se + bf.se * bf.se);
      if (dz <= -TREND_Z && wk.mean < 0) trends.push({ ...seg, dz });
    }
  }
  const found = bhDiscoveries(tested.map((t) => t.p));
  const leaks = tested.filter((t, i) => found.has(i) && t.shrunk < 0);
  const keyOf = (s) => `${s.dim}=${s.level}`;
  const leakKeys = new Set(leaks.map(keyOf));
  const out = [...leaks.map((s) => ({ ...s, kind: 'leak' })), ...trends.filter((s) => !leakKeys.has(keyOf(s))).map((s) => ({ ...s, kind: 'trend' }))];
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'leak' ? -1 : 1) || b.atRisk - a.atRisk || a.shrunk - b.shrunk);
  const list = out.map((s, i) => {
    const statLabel = s.dim === 'stat' || s.dim === 'stat+side' || s.dim === 'stat+line' ? s.rows[0] && marketOf(s.rows[0].b) : null;
    const causes = causesOf(s.rows, review?.reviews, review?.tally, sport, statLabel);
    return {
      rank: i + 1,
      kind: s.kind,
      segment: `${s.dim}: ${s.level}`,
      n: s.all.n,
      games: s.all.games,
      // (what it loses to the book, nats per 100 rows, shrunk; and as measured)
      loss: r4(-s.shrunk * 100),
      raw: r4(-s.all.mean * 100),
      z: r4(s.all.z),
      clv: fin(s.all.clv) ? `${s.all.clv > 0 ? '+' : ''}${(s.all.clv * 100).toFixed(1)}%` : null,
      week: fin(s.wk.mean) ? `${(-s.wk.mean * 100).toFixed(2)} this week, ${fin(s.bf.mean) ? (-s.bf.mean * 100).toFixed(2) : '-'} before${s.kind === 'trend' ? ` (${s.dz.toFixed(1)} se)` : ''}` : null,
      ...(s.kind === 'trend' ? {} : { p: r4(s.p) }),
      atRisk: r4(s.atRisk),
      causes: causes ? `${causes.causes.map((c) => `${c.cause} ${c.n}`).join(', ')} (${causes.from})` : null,
      fix: fixOf(s.dim, s.level, causes),
    };
  });
  const nLeaks = list.filter((x) => x.kind === 'leak').length;
  const nTrends = list.length - nLeaks;
  return {
    rows: list,
    n: rows.length,
    tested: tested.length,
    discovered: found.size,
    leaks: nLeaks,
    trends: nTrends,
    status: rows.length < LEAK_N ? 'thin' : nLeaks && list.some((x) => x.kind === 'leak' && x.atRisk > 0) ? 'flag' : nLeaks || nTrends ? 'watch' : 'ok',
    headline: !rows.length
      ? 'No priced rows graded yet'
      : nLeaks || nTrends
        ? list
            .slice(0, 3)
            .map((x) => `${x.segment} ${x.kind === 'leak' ? `losing ${x.loss.toFixed(2)} nats per 100 rows to the Book, shrunk (n ${x.n}, z ${x.z.toFixed(2)})` : `losing more this week (${x.week} nats per 100 rows)`}${x.atRisk ? `, ${x.atRisk}u at risk` : ''}`)
            .join('; ')
        : `${tested.length} segments tested on ${rows.length} priced rows: none losing to the Book beyond the false discovery rate, none trending worse`,
  };
}
