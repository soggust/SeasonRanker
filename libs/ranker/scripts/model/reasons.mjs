// Reason-based confidence tiers (DECISIONS.md D58; the owner, 2026-10-19, unhappy with D52's every-bet-a-LIKE). The
// reason D52's Kelly tiers never beat LIKE: a Kelly size measures how far the Bot disagrees with the Book, and a
// bigger disagreement is more often the Bot missing something (adverse selection). Confidence has to come from
// evidence that a pick wins, not from the size of the disagreement. So a bet's band comes from its REASONS: the named
// patterns that apply to it, each judged on its own held-out record.
//
//   reasons   REASONS: what the Bot knows at placement that might say a pick wins, each a family (independent
//             evidence: rest, timing, segment, stat, projection, size). The schedule's rest (D34, D51: the NHL's
//             side rested against a back-to-back, two or more days more rest), the timing (a bet at a clean open
//             (D42), the Book's opening price past the sharp book's no-vig at the same snapshot (D48's fair, D51's
//             books' gap)), the line's segment (D51: market, the favored side or the dog or a total's side, early or
//             late: the NFL's late overs), a prop's stat and side (the per-stat keys), the projection a full SD past
//             the line, and the Kelly size itself (2% or more; 5% or more at a 55% chance: the old bands, as one
//             candidate among the rest, earning their place like any other)
//   proven    walkReasons: each month, on the sport's bets settled before it (the replayed record's bets: a positive
//             edge at the Bot's own placement, flat 1u, recency-weighted by season), a reason is PROVEN in a market
//             where the picks carrying it made money, beat the rest of that market's picks by Z_LOVE standard errors,
//             led them in most seasons (SEASON_SHARE of the seasons with SEASON_MIN of its picks, two at least), and
//             beat the close at least as often where both have opens to read. STRONG where the lead is Z_LOCK SEs and
//             STRONG_LEAD points and its opens beat the close STRONG_BEAT more often than the rest's
//   tiers     tierOf: LIKE any positive edge; LOVE a proven reason; LOCK two proven reasons of different families, or
//             one strong; never a LOVE under the owner's 2% Kelly floor (LOVE_FLOOR). Then the tiers' own place
//             (placeTiers, walk-forward by month, as D51's bar earns its own): LOVE shows only where the would-be LOVEs
//             before that month beat the would-be LIKEs by flat return and by beat-the-close, LOCK only where its
//             would-be bets beat the LOVEs the same way; else the band is held a step down. So the ordering LOCK >
//             LOVE > LIKE is earned on the record, never assumed
//   stakes    TIER_UNITS: the stake (shrunk Kelly on the calibrated chance, as the desk sets it) held to its tier's cap:
//             a LIKE 1u, a LOVE 2u, a LOCK 3u: a big Kelly with no proven reason stakes as a LIKE
//   the file  apps/<sport>/src/StaticData/model/reasons.json, written by gate.mjs --record from the replayed record
//             (the shipped version's bets on the priced history), never by the desk: each market's reasons with their
//             records and verdicts, and the tiers' place. The desk reads it (run.mjs withConfidence) and the Book's
//             popover lists a bet's proven reasons with their records
//   loops     the record writes it; the desk and the board read it; nothing here moves a chance or a pick (the
//             Bot bets from any edge, D21), a reason is never a weight (D51's soft rule), and a band or a cap never
//             turns a bet off (D1)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const REASONS_V = 1;
// (a reason's proof: its picks in the market before the month, unweighted, and the share of them it must lead the
// rest of the market by, in standard errors)
export const R_MIN = 60;
export const Z_LOVE = 1.645;
export const Z_LOCK = 3;
export const STRONG_LEAD = 0.08;
export const STRONG_BEAT = 0.05;
// (the seasons a reason must lead in: SEASON_SHARE of those with SEASON_MIN of its picks, at least SEASONS_MIN)
export const SEASON_MIN = 10;
export const SEASON_SHARE = 0.6;
export const SEASONS_MIN = 2;
// (beat the close: compared where both sides have BEAT_MIN opens)
export const BEAT_MIN = 30;
// (the recency weight: DECAY a season back from the newest season with SEASON_MIN picks or more (a newer season
// with fewer counts whole, never more: one fresh pick can't outweigh a season's hundreds))
export const DECAY = 0.75;
// (the owner's Kelly floor: never a LOVE or a LOCK under it, D21)
export const LOVE_FLOOR = 0.02;
// (the tiers' own place: a tier shows once its would-be bets before the month number PLACE_MIN (LOCK half that))
export const PLACE_MIN = 40;
export const TIER_UNITS = { medium: 1, high: 2, lock: 3 };
export const BANDS = ['lock', 'high', 'medium'];
const RANK = { low: 0, medium: 1, high: 2, lock: 3 };
const fin = Number.isFinite;
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const r1 = (v) => (fin(v) ? Math.round(v * 10) / 10 : null);
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const impl = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const LINES = ['ml', 'spread', 'total'];
const SPORT_NAME = { nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB', mma: 'MMA' };
const MARKET_NAME = { ml: 'moneyline', spread: 'spread', total: 'total', prop: 'prop' };

// ---- the reasons ----

// (the fixed reasons; the segment's and the stat's are made per pick (reasonsFor)). Each: id, family, label, the
// markets it reads ('lines' the three game lines, 'prop', or a list), the sports (none: every sport) and its test on
// the pick's context (contextOf)
export const REASONS = [
  { id: 'restedVsB2b', family: 'rest', label: 'rested against a back-to-back', markets: ['ml', 'spread'], sports: ['nhl', 'nba'], test: (c) => !!c.op?.b2b && !c.me?.b2b },
  { id: 'rest2', family: 'rest', label: 'two or more days more rest', markets: ['ml', 'spread'], sports: ['nhl', 'nba'], test: (c) => fin(c.me?.rest) && fin(c.op?.rest) && c.me.rest - c.op.rest >= 2 },
  { id: 'openGap', family: 'timing', label: "the Book's opening price past the sharp book's", markets: 'lines', test: (c) => c.early && c.pin && fin(c.gap) && c.gap > 0 },
  { id: 'cleanOpen', family: 'timing', label: 'bet early, at a clean open', markets: 'all', test: (c) => c.early },
  { id: 'sd1', family: 'proj', label: 'the projection a full SD past the line', markets: ['prop'], test: (c) => fin(c.sdEdge) && c.sdEdge >= 1 },
  { id: 'kelly2', family: 'size', label: 'a Kelly score of 2% or more', markets: 'all', test: (c) => fin(c.kelly) && c.kelly >= 0.02 },
  { id: 'kelly5', family: 'size', label: 'a Kelly score of 5% or more at a 55% chance', markets: 'all', test: (c) => fin(c.kelly) && c.kelly >= 0.05 && fin(c.pS) && c.pS >= 0.55 },
];
const marketsOf = (r) => (r.markets === 'all' ? [...LINES, 'prop'] : r.markets === 'lines' ? LINES : r.markets);
const SIDE_WORD = { fav: 'favorites', dog: 'underdogs', over: 'overs', under: 'unders' };

// A pick's context for the reasons, from what the Bot knows at placement: { sport, market, side ('home' | 'away' |
// 'over' | 'under'), stat (a prop's), fS (the side's fair chance), pS (its chance), kelly (the stake's Kelly), odds,
// early (placed EARLY at a clean open (the replay) or 6 hours or more before the start (the live desk)), pin (the
// fair is the sharp book's), sched (the game's rest: desk.mjs scheduleRest's { rest, b2b } [home, away]), sdEdge (a
// prop's projection past the line on its side, in SDs) }
export function contextOf({ sport, market, side, stat = null, fS = null, pS = null, kelly = null, odds = null, early = false, pin = false, sched = null, sdEdge = null }) {
  const i = side === 'home' ? 0 : side === 'away' ? 1 : -1;
  const at = (j) => (sched && Array.isArray(sched.rest) && j >= 0 ? { rest: sched.rest[j], b2b: !!sched.b2b?.[j] } : null);
  const gap = fin(fS) && fin(odds) && odds ? fS - impl(odds) : null;
  return { sport, market, side, stat, fS, pS, kelly, odds, early: !!early, pin: !!pin, me: at(i), op: i >= 0 ? at(1 - i) : null, gap, sdEdge };
}

// (a line's side class, as desk.mjs segmentOf reads it: a total's side, else the favored side or the dog by its fair)
const classOf = (c) => (c.market === 'total' ? (c.side === 'under' ? 'under' : 'over') : fin(c.fS) && c.fS < 0.5 ? 'dog' : 'fav');
// The reasons a pick carries: [{ id, family, label }], the fixed ones whose test it meets, its line's segment (seg:
// <market>:<class>:<early|late>) or its prop's stat and side (stat:<stat>:<over|under>)
export function reasonsFor(c) {
  const out = [];
  for (const r of REASONS) {
    if (r.sports && !r.sports.includes(c.sport)) continue;
    if (!marketsOf(r).includes(c.market)) continue;
    if (r.test(c)) out.push({ id: r.id, family: r.family, label: r.label });
  }
  if (LINES.includes(c.market)) {
    const cls = classOf(c);
    out.push({ id: `seg:${c.market}:${cls}:${c.early ? 'early' : 'late'}`, family: 'segment', label: `${c.early ? 'early' : 'late'} ${c.market === 'total' ? '' : `${MARKET_NAME[c.market]} `}${SIDE_WORD[cls]}`.replace(/\s+/g, ' ') });
  } else if (c.market === 'prop' && c.stat && (c.side === 'over' || c.side === 'under')) {
    out.push({ id: `stat:${c.stat}:${c.side}`, family: 'stat', label: `${c.stat} ${c.side}s` });
  }
  return out;
}
// (a reason id's family and label, from the fixed list or its own shape)
export function reasonMeta(id) {
  const r = REASONS.find((x) => x.id === id);
  if (r) return { family: r.family, label: r.label };
  if (id.startsWith('seg:')) {
    const [, market, cls, timing] = id.split(':');
    return { family: 'segment', label: `${timing} ${market === 'total' ? '' : `${MARKET_NAME[market] ?? market} `}${SIDE_WORD[cls] ?? cls}`.replace(/\s+/g, ' ') };
  }
  if (id.startsWith('stat:')) {
    const [, stat, side] = id.split(':');
    return { family: 'stat', label: `${stat} ${side}s` };
  }
  return { family: id, label: id };
}

// ---- the records ----

// (a running tally of flat picks: unweighted n and profit, recency-weighted sums, beat-the-close, by season)
const emptyStats = () => ({ n: 0, sum: 0, w: 0, ws: 0, ws2: 0, w2: 0, beat: 0, beatN: 0, seasons: new Map() });
function addPick(s, p, w) {
  s.n++;
  s.sum += p.profit;
  s.w += w;
  s.ws += w * p.profit;
  s.ws2 += w * p.profit * p.profit;
  s.w2 += w * w;
  if (p.beat === 0 || p.beat === 1) {
    s.beatN++;
    s.beat += p.beat;
  }
  const ss = s.seasons.get(p.season) ?? s.seasons.set(p.season, { n: 0, sum: 0 }).get(p.season);
  ss.n++;
  ss.sum += p.profit;
}
// (a tally's recency-weighted mean and its standard error (the effective n's), its flat ROI and beat rate)
function readStats(s) {
  if (!s.n || !(s.w > 0)) return { n: s.n, mean: null, se: null, roi: null, beat: null, beatN: s.beatN };
  const mean = s.ws / s.w;
  const v = Math.max(0, s.ws2 / s.w - mean * mean);
  const neff = (s.w * s.w) / Math.max(1e-12, s.w2);
  return { n: s.n, mean, se: Math.sqrt(v / Math.max(1, neff)), roi: s.sum / s.n, beat: s.beatN ? s.beat / s.beatN : null, beatN: s.beatN };
}
// (the difference of two tallies: the reason's against the rest of its market's)
function less(a, b) {
  const out = emptyStats();
  for (const k of ['n', 'sum', 'w', 'ws', 'ws2', 'w2', 'beat', 'beatN']) out[k] = a[k] - b[k];
  for (const [season, x] of a.seasons) {
    const y = b.seasons.get(season) ?? { n: 0, sum: 0 };
    out.seasons.set(season, { n: x.n - y.n, sum: x.sum - y.sum });
  }
  return out;
}

// A reason's verdict from its tally and its market's: { on, strong, n, roi, rest, lead, z, beat, beatRest, seasons:
// { lead, of }, why }
export function verdictOf(mine, all, { zLove = Z_LOVE, zLock = Z_LOCK, rMin = R_MIN, seasonShare = SEASON_SHARE, seasonsMin = SEASONS_MIN } = {}) {
  const rest = less(all, mine);
  const a = readStats(mine);
  const b = readStats(rest);
  const out = { on: false, strong: false, n: a.n, roi: r4(a.roi), mean: r4(a.mean), rest: r4(b.mean), restN: b.n, lead: null, z: null, beat: r4(a.beat), beatN: a.beatN, beatRest: r4(b.beat), seasons: { lead: 0, of: 0, pos: 0 } };
  let lead = 0;
  let of = 0;
  let pos = 0;
  for (const [season, x] of mine.seasons) {
    if (x.n < SEASON_MIN) continue;
    const y = rest.seasons.get(season);
    of++;
    if (x.sum > 0) pos++;
    if (!y?.n || x.sum / x.n > y.sum / y.n) lead++;
  }
  out.seasons = { lead, of, pos };
  if (a.n < rMin || b.n < rMin || a.mean === null || b.mean === null) return { ...out, why: `${a.n} picks, under ${rMin}` };
  const d = a.mean - b.mean;
  const se = Math.sqrt(a.se * a.se + b.se * b.se);
  const z = se > 0 ? d / se : 0;
  out.lead = r4(d);
  out.z = r4(z);
  const beatOk = !(a.beatN >= BEAT_MIN && b.beatN >= BEAT_MIN) || a.beat >= b.beat;
  const seasonsOk = of >= seasonsMin && lead / of >= seasonShare;
  out.on = a.mean > 0 && z >= zLove && seasonsOk && beatOk;
  out.strong = out.on && z >= zLock && d >= STRONG_LEAD && a.beatN >= BEAT_MIN && b.beatN >= BEAT_MIN && a.beat - b.beat >= STRONG_BEAT;
  out.why = out.on ? `${out.strong ? 'strong: ' : ''}+${r1(d * 100)} points over the rest at ${r1(z)} SEs, ${lead} of ${of} seasons` : !(a.mean > 0) ? 'its picks lose' : z < zLove ? `a lead of ${r1(d * 100)} points at ${r1(z)} SEs, under ${zLove}` : !seasonsOk ? `led in ${lead} of ${of} seasons` : 'beat the close less often than the rest';
  return out;
}

// (a pick for the walk: { t, season, market, reasons: [id], profit (flat 1u at its price), beat (0/1/null), kelly })
const monthOf = (t) => new Date(t).toISOString().slice(0, 7);
// The reasons walk-forward: each month's verdicts by market and reason from the picks of the months before it alone,
// recency-weighted by the month's own season. { at(t, market) -> Map(id -> verdict) | null, months, final (the
// verdicts on every pick: what the file carries for the live desk) }
export function walkReasons(picks, opts = {}) {
  const list = (picks ?? []).filter((p) => fin(p?.t) && fin(p.profit) && p.market).sort((a, b) => a.t - b.t);
  const byMonth = new Map();
  for (const p of list) (byMonth.get(monthOf(p.t)) ?? byMonth.set(monthOf(p.t), []).get(monthOf(p.t))).push(p);
  const months = [...byMonth.keys()].sort();
  const before = [];
  const verdicts = new Map();
  const judge = (pool) => {
    const counts = new Map();
    for (const p of pool) if (fin(p.season)) counts.set(p.season, (counts.get(p.season) ?? 0) + 1);
    const full = [...counts].filter(([, n]) => n >= SEASON_MIN).map(([s]) => s);
    const ref = full.length ? Math.max(...full) : null;
    const w = (p) => (fin(ref) && fin(p.season) ? DECAY ** Math.max(0, ref - p.season) : 1);
    const all = new Map();
    const by = new Map();
    for (const p of pool) {
      const wt = w(p);
      addPick(all.get(p.market) ?? all.set(p.market, emptyStats()).get(p.market), p, wt);
      for (const id of p.reasons ?? []) {
        const key = `${p.market}|${id}`;
        addPick(by.get(key) ?? by.set(key, emptyStats()).get(key), p, wt);
      }
    }
    const out = new Map();
    for (const [key, s] of by) {
      const [market, id] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
      (out.get(market) ?? out.set(market, new Map()).get(market)).set(id, verdictOf(s, all.get(market), opts));
    }
    return out;
  };
  for (const m of months) {
    verdicts.set(m, before.length ? judge(before) : new Map());
    before.push(...byMonth.get(m));
  }
  const final = list.length ? judge(list) : new Map();
  return {
    months,
    at: (t, market) => {
      const m = monthOf(t);
      if (verdicts.has(m)) return verdicts.get(m).get(market) ?? null;
      // (a month with no picks of its own: the newest month before it)
      let use = null;
      for (const k of months) {
        if (k > m) break;
        use = k;
      }
      if (use === null) return null;
      // (a later month than any judged: every pick before it)
      return (m > months[months.length - 1] ? final : verdicts.get(use))?.get(market) ?? null;
    },
    final,
  };
}

// A pick's tier from its reasons and the verdicts standing at its moment: { tier ('lock' | 'high' | 'medium'),
// proven: [{ id, family, label, strong, n, roi, lead, seasons }] }. Never a LOVE or a LOCK under the Kelly floor
export function tierOf(reasonIds, verdicts, kelly) {
  const proven = [];
  for (const id of reasonIds ?? []) {
    const v = verdicts?.get?.(id) ?? verdicts?.[id];
    if (!v?.on) continue;
    const meta = reasonMeta(id);
    proven.push({ id, family: meta.family, label: meta.label, strong: !!v.strong, n: v.n, roi: v.roi, lead: v.lead, beat: v.beat, seasons: v.seasons });
  }
  const families = new Set(proven.map((p) => p.family));
  const raw = !proven.length ? 'medium' : families.size >= 2 || proven.some((p) => p.strong) ? 'lock' : 'high';
  const tier = fin(kelly) && kelly >= LOVE_FLOOR ? raw : 'medium';
  return { tier, raw, proven };
}

// (a tier held to the place's verdict: no LOVE where LOVE hasn't earned its place, no LOCK where LOCK hasn't)
export const placed = (tier, place) => (tier === 'lock' && !place?.lock ? (place?.love ? 'high' : 'medium') : tier === 'high' && !place?.love ? 'medium' : tier);

// The tiers' own place walk-forward by month (as D51's bar earns its own): bets [{ t, tier (the would-be tier),
// profit (flat), beat }]; at each month, LOVE shows where the would-be LOVEs and LOCKs before it beat the would-be
// LIKEs (flat return, and beat-the-close where both have BEAT_MIN opens) on PLACE_MIN of them; LOCK where LOVE does
// and the would-be LOCKs (PLACE_MIN / 2) beat the would-be LOVEs the same way. { at(t) -> { love, lock }, final }
export function placeTiers(bets) {
  const list = (bets ?? []).filter((b) => fin(b?.t) && fin(b.profit) && b.tier).sort((a, b) => a.t - b.t);
  const months = [...new Set(list.map((b) => monthOf(b.t)))].sort();
  const tally = { medium: { n: 0, sum: 0, beat: 0, beatN: 0 }, high: { n: 0, sum: 0, beat: 0, beatN: 0 }, lock: { n: 0, sum: 0, beat: 0, beatN: 0 } };
  const add = (t, b) => {
    t.n++;
    t.sum += b.profit;
    if (b.beat === 0 || b.beat === 1) {
      t.beatN++;
      t.beat += b.beat;
    }
  };
  const join = (a, b) => ({ n: a.n + b.n, sum: a.sum + b.sum, beat: a.beat + b.beat, beatN: a.beatN + b.beatN });
  const over = (a, b, min) => a.n >= min && b.n >= min && a.sum / a.n > b.sum / b.n && (!(a.beatN >= BEAT_MIN && b.beatN >= BEAT_MIN) || a.beat / a.beatN >= b.beat / b.beatN);
  const verdict = () => {
    const love = over(join(tally.high, tally.lock), tally.medium, PLACE_MIN);
    return { love, lock: love && over(tally.lock, tally.high, PLACE_MIN / 2) };
  };
  const at = new Map();
  let i = 0;
  for (const m of months) {
    at.set(m, verdict());
    while (i < list.length && monthOf(list[i].t) === m) add(tally[list[i].tier], list[i++]);
  }
  const rec = (t) => ({ n: t.n, roi: t.n ? r4(t.sum / t.n) : null, beat: t.beatN ? r4(t.beat / t.beatN) : null, beatN: t.beatN });
  const final = { ...verdict(), would: { lock: rec(tally.lock), high: rec(tally.high), medium: rec(tally.medium) } };
  return {
    at: (t) => {
      const m = monthOf(t);
      if (at.has(m)) return at.get(m);
      return m > (months[months.length - 1] ?? '') ? final : { love: false, lock: false };
    },
    final,
  };
}

// (a stake held to its tier's cap)
export const tierUnits = (units, band) => (fin(units) ? Math.min(units, TIER_UNITS[band] ?? TIER_UNITS.medium) : units);

// A proven reason in words, as the Book's popover lists it: "NHL rested against a back-to-back: 5 of 7 seasons, +4.1%"
export function reasonText(sport, market, p) {
  const name = SPORT_NAME[sport] ?? String(sport ?? '').toUpperCase();
  const seasons = p.seasons?.of ? `${p.seasons.lead} of ${p.seasons.of} seasons, ` : '';
  const roi = fin(p.roi) ? `${p.roi >= 0 ? '+' : ''}${r1(p.roi * 100)}%` : '';
  return `${name} ${p.label}${market && market !== 'prop' && !String(p.id).startsWith('seg:') ? ` (${MARKET_NAME[market] ?? market})` : ''}: ${seasons}${roi} on ${p.n}`;
}

// ---- the file ----

// The file's content from the walk (the final verdicts: what the desk reads) and the place: { v, sport, markets: {
// <market>: { <id>: verdict } }, place: { love, lock, would }, consts }
export function fileOf(sport, walk, place, { at = new Date().toISOString(), epoch = null } = {}) {
  const markets = {};
  for (const [market, m] of walk.final) {
    markets[market] = {};
    for (const [id, v] of [...m].sort((a, b) => (b[1].z ?? -99) - (a[1].z ?? -99))) {
      const meta = reasonMeta(id);
      markets[market][id] = { ...v, family: meta.family, label: meta.label };
    }
  }
  return { v: REASONS_V, sport, at, epoch, markets, place: place.final, consts: { R_MIN, Z_LOVE, Z_LOCK, STRONG_LEAD, STRONG_BEAT, SEASON_MIN, SEASON_SHARE, SEASONS_MIN, BEAT_MIN, LOVE_FLOOR, PLACE_MIN, TIER_UNITS } };
}

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const reasonsFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'src/StaticData/model/reasons.json');
// The sport's file as the desk reads it; null with none or one it can't read (every bet a LIKE at most then: no
// reason proven, D1 still: every edge is bet)
export function readReasons(sport, root = ROOT) {
  try {
    const f = reasonsFile(sport, root);
    if (!existsSync(f)) return null;
    const m = JSON.parse(readFileSync(f, 'utf8'));
    return m && m.v === REASONS_V && m.markets ? m : null;
  } catch {
    return null;
  }
}

// The live desk's read of a bet: its reasons, the file's verdicts on them, its tier held to the place: { tier, raw,
// proven: [{ id, label, text, n, roi, seasons }], units (its stake held to the tier's cap) }; null without a file
export function liveTier(file, ctx, { units = null } = {}) {
  if (!file?.markets) return null;
  const ids = reasonsFor(ctx).map((r) => r.id);
  const v = file.markets[ctx.market] ?? {};
  const t = tierOf(ids, v, ctx.kelly);
  const band = placed(t.tier, file.place);
  return { tier: band, raw: t.tier, reasons: ids, proven: t.proven.map((p) => ({ id: p.id, label: p.label, text: reasonText(ctx.sport, ctx.market, p), n: p.n, roi: p.roi, seasons: p.seasons })), ...(fin(units) ? { units: tierUnits(units, band) } : {}) };
}

export const bandRank = (b) => RANK[b] ?? 0;
export { dec as decimalOf };
