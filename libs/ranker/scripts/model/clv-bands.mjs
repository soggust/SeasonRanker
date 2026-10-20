// Confidence bands earned on the closing line (Gemini's design, the owner's round of 2026-10-20; DECISIONS.md D70):
// a reason (a segment, a stat's side, a timing, a named reason) earns LOVE or LOCK by the empirical-Bayes-shrunk mean
// expected return of its bets at the fair close (EV_CLV: the bet's own price against the sharp book's closing
// no-vig chance at its line, clv in the replay's bets), w = n / (n + k), and the share of them that beat the fair
// close; walk-forward: a bet reads only the bets settled before its own placement. A market with no closing check
// (the props, bet at the close; the NFL's lines, all at the close) can't earn by it until it is bet earlier; a rule's
// `fallback: 'results'` lets such a reason earn on D58's results bar instead (a variant, judged in band-lab.mjs).
//
// One rule engine for the lab (band-lab.mjs, every variant on the replayed bets) and the shipped rule
// (replay-record.mjs's tiers and the reasons.json the live desk reads, run.mjs withTier: a reason's verdict { on,
// strong } where on is LOVE's bar and strong LOCK's, so reasons.mjs tierOf reads it unchanged).

import { LOVE_FLOOR, TIER_UNITS, isLive, placeTiers, placed, reasonMeta, walkReasons } from './reasons.mjs';

const fin = Number.isFinite;
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
export const GAME_HOURS = 3;

// The rule's defaults (Gemini's numbers): LOVE n 50, shrunk EV_CLV +2%, beat 51.5%; LOCK n 150, +4%, 53.5%; k 100
export const CLV_RULE = {
  name: 'clv',
  k: 100,
  prior: 'zero',
  love: { n: 50, ev: 0.02, beat: 0.515 },
  lock: { n: 150, ev: 0.04, beat: 0.535 },
  twoLove: true,
  results: null,
  fallback: 'none',
  place: false,
  kellyFloor: LOVE_FLOOR,
  units: { ...TIER_UNITS },
};

// (a group's running tally: the bets with a closing check (EV_CLV and beat), and every graded bet's flat result)
const empty = () => ({ n: 0, s: 0, s2: 0, beat: 0, rn: 0, rs: 0, rs2: 0 });
function add(g, p) {
  if (fin(p.clv)) {
    g.n++;
    g.s += p.clv;
    g.s2 += p.clv * p.clv;
    if (p.clv > 0) g.beat++;
  }
  if (fin(p.profit)) {
    g.rn++;
    g.rs += p.profit;
    g.rs2 += p.profit * p.profit;
  }
}
// (the method-of-moments k: within-group variance over between-group variance, groups of 20 or more; clamped)
export function ebK(groups, { min = 20, lo = 20, hi = 2000 } = {}) {
  const gs = [...groups].filter((g) => g.n >= min);
  if (gs.length < 3) return hi;
  let wv = 0;
  let wn = 0;
  const means = [];
  for (const g of gs) {
    const m = g.s / g.n;
    const v = Math.max(0, g.s2 / g.n - m * m);
    wv += v * g.n;
    wn += g.n;
    means.push({ m, n: g.n });
  }
  const sigma2 = wv / wn;
  const mbar = means.reduce((t, x) => t + x.m, 0) / means.length;
  const between = means.reduce((t, x) => t + (x.m - mbar) ** 2, 0) / (means.length - 1);
  const noise = means.reduce((t, x) => t + sigma2 / x.n, 0) / means.length;
  const tau2 = between - noise;
  if (!(tau2 > 0)) return hi;
  return Math.min(hi, Math.max(lo, sigma2 / tau2));
}
// A group's verdict under the rule: { n, ev (raw), evS (shrunk), beat, love, lock, rn, roi }
export function judge(g, rule, { k, prior = 0 }) {
  const ev = g.n ? g.s / g.n : null;
  const w = g.n / (g.n + k);
  const evS = g.n ? w * ev + (1 - w) * prior : null;
  const beat = g.n ? g.beat / g.n : null;
  const roi = g.rn ? g.rs / g.rn : null;
  const rse = g.rn > 1 ? Math.sqrt(Math.max(0, g.rs2 / g.rn - roi * roi) / g.rn) : null;
  const resOk = !rule.results || (g.rn >= (rule.results.n ?? 0) && fin(roi) && roi - (rule.results.z ?? 0) * (rse ?? 0) >= (rule.results.roi ?? 0));
  const pass = (bar) => g.n >= bar.n && evS >= bar.ev && beat >= bar.beat && resOk;
  const love = pass(rule.love);
  return { n: g.n, ev: r4(ev), evS: r4(evS), beat: r4(beat), rn: g.rn, roi: r4(roi), love, lock: love && pass(rule.lock) };
}

// The walk: picks [{ t (settled), at (placed), market, ids, clv, profit (flat), season, beat }] in any order; returns
// at(i) the verdicts standing at pick i's placement (Map id -> verdict, its market's) and final (Map market -> Map
// id -> verdict on every pick). D58's results walk rides beside it for the fallback.
export function walkClv(picks, rule = CLV_RULE) {
  const byAt = picks.map((p, i) => ({ p, i })).sort((a, b) => a.p.at - b.p.at);
  const bySettle = picks.map((p, i) => ({ p, i })).sort((a, b) => a.p.t - b.p.t);
  const groups = new Map();
  const market = new Map();
  const groupOf = (m, id) => {
    const key = `${m}|${id}`;
    return groups.get(key) ?? groups.set(key, empty()).get(key);
  };
  const results = rule.fallback === 'results' ? walkReasons(picks.map((p) => ({ t: p.t, season: p.season, market: p.market, reasons: p.ids, profit: p.profit, beat: p.beat }))) : null;
  const out = new Array(picks.length);
  let j = 0;
  let kNow = typeof rule.k === 'number' ? rule.k : null;
  let lastMonth = null;
  for (const { p, i } of byAt) {
    while (j < bySettle.length && bySettle[j].p.t <= p.at) {
      const q = bySettle[j++].p;
      add(market.get(q.market) ?? market.set(q.market, empty()).get(q.market), q);
      for (const id of q.ids ?? []) add(groupOf(q.market, id), q);
    }
    // (k by the evidence before the month, re-estimated once a month)
    const month = new Date(p.at).toISOString().slice(0, 7);
    if (rule.k === 'eb' && month !== lastMonth) {
      kNow = ebK(groups.values());
      lastMonth = month;
    }
    const mk = market.get(p.market);
    const prior = rule.prior === 'market' && mk?.n ? mk.s / mk.n : 0;
    const v = new Map();
    const fb = results ? results.at(p.at, p.market) : null;
    for (const id of p.ids ?? []) {
      const g = groups.get(`${p.market}|${id}`) ?? empty();
      const x = judge(g, rule, { k: kNow, prior });
      // (a reason with no closing evidence to speak of, under the fallback: D58's results verdict)
      if (results && g.n < (rule.fallbackBelow ?? 30)) {
        const d = fb?.get?.(id);
        x.love = !!d?.on;
        x.lock = !!d?.strong;
        x.via = 'results';
      }
      v.set(id, x);
    }
    out[i] = v;
  }
  // (the final verdicts on every pick: what reasons.json carries for the live desk)
  const final = new Map();
  const kF = typeof rule.k === 'number' ? rule.k : ebK(groups.values());
  const resF = results?.final ?? null;
  for (const [key, g] of groups) {
    const m = key.slice(0, key.indexOf('|'));
    const id = key.slice(key.indexOf('|') + 1);
    const mk = market.get(m);
    const x = judge(g, rule, { k: kF, prior: rule.prior === 'market' && mk?.n ? mk.s / mk.n : 0 });
    x.stats = { ...g };
    if (resF && g.n < (rule.fallbackBelow ?? 30)) {
      const d = resF.get(m)?.get(id);
      x.love = !!d?.on;
      x.lock = !!d?.strong;
      x.via = 'results';
    }
    (final.get(m) ?? final.set(m, new Map()).get(m)).set(id, x);
  }
  return { at: (i) => out[i], final, k: kF };
}

// A pick's tier under the rule from its verdicts: LOCK where one reason clears LOCK's bar (or, twoLove, two of
// different families clear LOVE's), LOVE where one clears LOVE's; the owner's Kelly floor under both
export function tierClv(ids, verdicts, kelly, rule = CLV_RULE) {
  const proven = (ids ?? []).filter((id) => verdicts?.get?.(id)?.love);
  const locks = proven.filter((id) => verdicts.get(id).lock);
  const fam = new Set(proven.map((id) => reasonMeta(id).family));
  const raw = locks.length || (rule.twoLove && fam.size >= 2) ? 'lock' : proven.length ? 'high' : 'medium';
  const floor = rule.kellyFloor ?? LOVE_FLOOR;
  return { tier: fin(kelly) && kelly >= floor ? raw : floor <= 0 ? raw : 'medium', raw, proven };
}

// The verdicts as reasons.mjs reads them (on LOVE's bar, strong LOCK's), for reasons.json's markets
export function asVerdicts(final) {
  const out = {};
  for (const [m, ids] of final) out[m] = Object.fromEntries([...ids].map(([id, x]) => [id, { on: !!x.love, strong: !!x.lock, n: x.n, ev: x.ev, evS: x.evS, beat: x.beat, roi: x.roi, rn: x.rn, ...(x.via ? { via: x.via } : {}), ...(x.stats ? { stats: Object.fromEntries(Object.entries(x.stats).map(([k, v]) => [k, r4(v)])) } : {}), why: x.love ? `${x.lock ? 'LOCK' : 'LOVE'}: ${Math.round((x.evS ?? 0) * 1000) / 10}% shrunk at the fair close on ${x.n}, beat ${Math.round((x.beat ?? 0) * 1000) / 10}%` : `${x.n} with a close, ${x.evS === null ? '-' : `${Math.round(x.evS * 1000) / 10}%`} shrunk`, seasons: { lead: 0, of: 0, pos: 0 } }]));
  return out;
}

// The bands on a replay's bets under a rule, walk-forward: bets (the replay's, each with lab { ids, before, suspect,
// barred }); sets each bet's band, units and profit; returns { walk, place, counts }
export function bandBets(bets, rule = CLV_RULE, { flat = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0) } = {}) {
  const mine = bets.filter((b) => b.lab?.before && !b.practice);
  const picks = mine.map((b) => ({ t: b.t + GAME_HOURS * 36e5, at: b.at, market: b.market, ids: b.lab.ids, clv: fin(b.clv) ? b.clv : null, profit: flat(b), season: b.season, beat: b.beat }));
  const walk = walkClv(picks, rule);
  const would = mine.map((b, i) => tierClv(b.lab.ids, walk.at(i), b.kelly, rule));
  const place = rule.place ? placeTiers(mine.map((b, i) => ({ t: picks[i].t, tier: would[i].tier, profit: picks[i].profit, beat: b.beat }))) : null;
  const counts = { lock: 0, high: 0, medium: 0 };
  mine.forEach((b, i) => {
    const before = b.lab.before;
    let band = place ? placed(would[i].tier, place.at(b.at)) : would[i].tier;
    if ((b.lab.suspect || b.lab.barred) && band !== 'medium') band = 'medium';
    const cap = rule.units?.[band] ?? TIER_UNITS[band] ?? 1;
    const units = b.lab.suspect || b.lab.barred ? before.units : Math.min(before.units, cap);
    b.profit = before.units > 0 ? Math.round(((before.profit * units) / before.units) * 100) / 100 : 0;
    b.units = units;
    b.band = band;
    b.would = would[i].tier;
    b.reasons = would[i].proven.length ? would[i].proven : undefined;
    delete b.beatHeld;
    counts[band]++;
  });
  return { walk, place, counts };
}

// The rule shipped (D70, the band lab's verdict): Gemini's closing-line bars with the results guard (a reason's
// flat results on its graded bets not under 0 over 50 of them): the fair close's no-vig can overrate a side (D59, D61:
// the NFL's and MMA's dogs "beat" a close that overrates them and lose), so a closing-line lead alone doesn't earn
export const SHIPPED = { ...CLV_RULE, name: 'clv-results', results: { n: 50, roi: 0, z: 0 } };
// (the rule as reasons.json keeps it, and back)
export const ruleFile = (rule) => ({ name: rule.name, k: rule.k, prior: rule.prior, love: rule.love, lock: rule.lock, twoLove: rule.twoLove, results: rule.results, fallback: rule.fallback, place: !!rule.place, kellyFloor: rule.kellyFloor, units: rule.units });
export const isClvFile = (file) => !!file?.rule?.love && file.rule.name !== 'd58';

// A reasons.json under the rule: each market's reasons with their verdicts and closing-line tallies, the rule, and the
// place (always shown where the rule has no place check of its own: the bars are the earning)
export function clvFileOf(sport, walk, rule, place, { at = new Date().toISOString(), epoch = null, version = 1 } = {}) {
  const markets = asVerdicts(walk.final);
  for (const ids of Object.values(markets)) for (const [id, v] of Object.entries(ids)) Object.assign(v, reasonMeta(id));
  return { v: version, sport, at, epoch, markets, place: place ? place.final : { love: true, lock: true }, rule: ruleFile(rule), k: walk.k };
}

// The live desk's verdicts under the file's rule: the record's closing-line tallies (the replay before the epoch) and
// the live ledger's graded, staked bets since the epoch (each with its reasons as the desk read them at placement and
// its closing-line return), so a reason earns between records on live closing lines. Map(market -> Map(id -> verdict))
export function liveMerged(file, livePicks, { rule = file?.rule ?? SHIPPED } = {}) {
  const live = new Map();
  for (const p of livePicks ?? []) {
    for (const id of p.ids ?? []) {
      const key = `${p.market}|${id}`;
      add(live.get(key) ?? live.set(key, empty()).get(key), p);
    }
  }
  const out = new Map();
  const keys = new Set([...live.keys(), ...Object.entries(file?.markets ?? {}).flatMap(([m, ids]) => Object.keys(ids).map((id) => `${m}|${id}`))]);
  const k = typeof file?.k === 'number' ? file.k : typeof rule.k === 'number' ? rule.k : 100;
  for (const key of keys) {
    const m = key.slice(0, key.indexOf('|'));
    const id = key.slice(key.indexOf('|') + 1);
    // (a live-only reason (D66) takes nothing from the file: no prior, its own live record alone)
    const base = isLive(id) ? empty() : (file?.markets?.[m]?.[id]?.stats ?? empty());
    const l = live.get(key) ?? empty();
    const g = empty();
    for (const f of Object.keys(g)) g[f] = (base[f] ?? 0) + (l[f] ?? 0);
    const x = judge(g, rule, { k, prior: 0 });
    (out.get(m) ?? out.set(m, new Map()).get(m)).set(id, { on: x.love, strong: x.lock, n: x.n, ev: x.ev, evS: x.evS, beat: x.beat, roi: x.roi, rn: x.rn, live: l.n, seasons: { lead: 0, of: 0, pos: 0 } });
  }
  return out;
}
