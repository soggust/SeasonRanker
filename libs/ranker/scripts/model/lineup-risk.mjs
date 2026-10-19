// The lineup risk (DECISIONS.md D37, the owner, 2026-10-19): the Bot picks its own time to bet inside the window.
// An early bet faces the news the Book's close will know and the Bot reads late or never (a lineup, an inactive, a
// goalie, a probable, a leash): the usage behind the stat changes between the early price and the lock, and the
// Book moves with it. So before the news is in, a prop's lean is held to the share of it that has survived to the
// close historically, per sport and stat, and the row is bet early only if that shrunk lean still clears the
// price; else it waits (a suggestion on the board, never a tracked row), and at the last chance it is bet with
// what's known. This is about having the Book's information, not racing the line: the Bot bets when its edge is
// real at the price offered then (D30: the price at that moment, never a stored or snapshot one).
//
//   kept      a stat's survival: of the Bot's edge on its own side at the open (OPEN_LEAD hours before the start,
//             the priced history's), the share still there at the close on the same side at the close's line and
//             price: sum of the close's edge over the sum of the open's, on the rows the Bot would have bet
//             (an edge of EDGE_MIN or more at the open). 1 every point survived, 0 none, under 0 the close went the
//             other way (held to 0). Fit by gate.mjs on the priced history (gate-history.mjs propHistoryRows, the
//             trusted chance at both ends) and written by --record to apps/<sport>/src/StaticData/model/
//             lineup-risk.json, with each stat's lead (the open's hours before the start) and moved (the share of
//             rows whose line moved or whose price moved 5 points or more by the close: how often the usage
//             changed)
//   s(h)      the survival at h hours before the start: kept at the open's lead or further out, 1 inside the last
//             chance, a straight line between; 1 once the news the stat waits for is in (the lineup, the starters,
//             the goalies: timing.mjs newsMissing says so). A stat with no fit (under RISK_MIN rows, or no file)
//             is 0 before the last chance: with no evidence the edge survives, the Bot waits (the owner's rule)
//   live      self-tuning on the Bot's own record: its bets since the epoch, by sport, stat and the hours before
//             the start they were placed (HOUR_BUCKETS), the same ratio from each bet's edge at placement (p
//             against the Book's fair) and at the close (clv.q against the same fair). Blended into the history's
//             survival at that bucket by its rows' worth (n / (n + RISK_K)), soft, never a switch (D8)
//   the hold  riskChance: the chance the Bot bets with early, fair + s x (p - fair); with an edge at the price it
//             bets now and the bet carries { hours, s, p } so the record can judge the timing; without one the row
//             is held (not tracked: a tracked row would block the bet later), shown on the board as a suggestion
//             only where the full lean has an edge (sug)

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const fin = Number.isFinite;
const r3 = (v) => (fin(v) ? Math.round(v * 1000) / 1000 : null);
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const RISK_V = 1;
// (the edge at the open a row needs to count as one the Bot would have bet: points of chance over the Book's fair)
export const EDGE_MIN = 0.01;
// (rows a stat's fit needs; under it the sport's pooled survival, and under it there, none: 0)
export const RISK_MIN = 300;
// (the ledger's rows' worth to count half against the history's survival at the bucket)
export const RISK_K = 40;
// (the price move at the same line that counts as the usage having changed: 5 points of fair chance)
export const MOVED_PTS = 0.05;
// (the ledger's buckets by hours before the start a bet was placed: their upper bounds)
export const HOUR_BUCKETS = [2, 4, 8, 14, 27, Infinity];
export const bucketOf = (hours) => HOUR_BUCKETS.findIndex((h) => hours < h);

// (one stat's survival from its pairs: [{ eo (the Bot's edge at the open on its side), ec (at the close on the same
// side), moved, lead }])
function fitOne(pairs) {
  const bet = pairs.filter((x) => fin(x.eo) && fin(x.ec) && x.eo >= EDGE_MIN);
  const so = bet.reduce((s, x) => s + x.eo, 0);
  const sc = bet.reduce((s, x) => s + x.ec, 0);
  const n = bet.length;
  const all = pairs.filter((x) => fin(x.eo) && fin(x.ec));
  return {
    n,
    rows: all.length,
    keptRaw: so > 0 ? r4(sc / so) : null,
    kept: so > 0 ? r4(clip(sc / so, 0, 1)) : null,
    moved: all.length ? r3(all.filter((x) => x.moved).length / all.length) : null,
    lead: all.length ? r3(all.reduce((s, x) => s + (fin(x.lead) ? x.lead : 0), 0) / all.length) : null,
    edgeOpen: n ? r4(so / n) : null,
    edgeClose: n ? r4(sc / n) : null,
  };
}

// Every stat's survival on the history's pairs ({ stat, eo, ec, moved, lead }): { v, at, rows, pooled, stats: { <stat>:
// { n, rows, kept, keptRaw, moved, lead, edgeOpen, edgeClose, from ('own' or 'pooled') } } }
export function fitLineupRisk(pairs, { at = null } = {}) {
  const byStat = new Map();
  for (const x of pairs) (byStat.get(x.stat) ?? byStat.set(x.stat, []).get(x.stat)).push(x);
  const pooled = fitOne(pairs);
  const pooledOk = pooled.n >= RISK_MIN && pooled.kept !== null;
  const stats = {};
  for (const [stat, list] of [...byStat].sort((a, b) => a[0].localeCompare(b[0]))) {
    const own = fitOne(list);
    if (own.n >= RISK_MIN && own.kept !== null) stats[stat] = { ...own, from: 'own' };
    else stats[stat] = { ...own, kept: pooledOk ? pooled.kept : null, keptRaw: pooledOk ? pooled.keptRaw : null, from: pooledOk ? 'pooled' : 'none' };
  }
  return { v: RISK_V, at: at ?? new Date().toISOString(), rows: pairs.length, pooled: { ...pooled, ok: pooledOk }, stats };
}

// The survival at hours before the start from a stat's entry ({ kept, lead }) and the sport's last chance (hours):
// 1 inside the last chance or with the news in, kept at the lead or further out, between them a straight line; 0
// with no entry (the Bot waits)
export function survivalAt(entry, hours, { last = 3, newsIn = false } = {}) {
  if (newsIn || !fin(hours) || hours <= last) return 1;
  if (!entry || !fin(entry.kept)) return 0;
  const lead = fin(entry.lead) && entry.lead > last ? entry.lead : last;
  if (hours >= lead) return entry.kept;
  return 1 - (1 - entry.kept) * ((hours - last) / (lead - last));
}

// The Bot's own record by stat and bucket: its prop bets since the epoch with a close (clv.q, the close's chance at
// the bet's own price and line) by the hours before the start they were placed: { <stat>: { <bucket>: { n, kept } } }.
// kept as the history's: the close's edge over the placement's, on the bets with an edge at placement
export function ledgerRisk(bets, { epoch = null } = {}) {
  const out = {};
  const acc = new Map();
  for (const b of bets ?? []) {
    if (!b || b.market !== 'prop' || b.void || !b.propType || !fin(b.clv?.q) || !fin(b.fair) || !fin(b.p) || !b.placedAt || !b.start) continue;
    if (epoch && Date.parse(b.placedAt) < Date.parse(epoch)) continue;
    const hours = (Date.parse(b.start) - Date.parse(b.placedAt)) / 36e5;
    if (!fin(hours)) continue;
    // (the bet's p is its side's chance, as its fair and clv.q are)
    const eo = b.p - b.fair;
    if (eo < EDGE_MIN) continue;
    const ec = b.clv.q - b.fair;
    const k = `${b.propType}|${bucketOf(hours)}`;
    const a = acc.get(k) ?? { n: 0, so: 0, sc: 0 };
    a.n++;
    a.so += eo;
    a.sc += ec;
    acc.set(k, a);
  }
  for (const [k, a] of acc) {
    const [stat, bucket] = k.split('|');
    (out[stat] ??= {})[bucket] = { n: a.n, kept: a.so > 0 ? r4(clip(a.sc / a.so, 0, 1)) : null };
  }
  return out;
}

// A row's survival now: the history's at these hours blended with the Bot's own record at the bucket by its rows'
// worth (n / (n + RISK_K)). { s, hist, live: { n, kept } | null, bucket }
export function riskAt(risk, live, stat, hours, { last = 3, newsIn = false } = {}) {
  const entry = risk?.stats?.[stat] ?? null;
  const hist = survivalAt(entry, hours, { last, newsIn });
  if (hist >= 1) return { s: 1, hist: 1, live: null, bucket: null };
  const bucket = bucketOf(hours);
  const own = live?.[stat]?.[bucket] ?? null;
  if (!own || !fin(own.kept) || !(own.n > 0)) return { s: r4(hist), hist: r4(hist), live: null, bucket };
  const w = own.n / (own.n + RISK_K);
  return { s: r4(clip((1 - w) * hist + w * own.kept, 0, 1)), hist: r4(hist), live: { n: own.n, kept: own.kept, w: r3(w) }, bucket };
}

// The chance the Bot bets with early: the Book's fair plus the surviving share of its lean (its side's chance p
// against its side's fair)
export const riskChance = (fair, p, s) => fair + clip(s, 0, 1) * (p - fair);

// The sport's lineup risk as the live desk reads it: apps/<sport>/src/StaticData/model/lineup-risk.json, written by
// gate.mjs --record; null with none (every stat waits for the last chance) or one it can't read
export function readLineupRisk(root, sport) {
  const file = path.join(root, 'apps', sport, 'src/StaticData/model/lineup-risk.json');
  try {
    if (!existsSync(file)) return null;
    const fit = JSON.parse(readFileSync(file, 'utf8'));
    return fit && fit.stats && typeof fit.stats === 'object' ? fit : null;
  } catch {
    return null;
  }
}

// The run log's line: each stat's survival and how often its usage changed
export const riskText = (fit) => (fit?.stats ? Object.entries(fit.stats).map(([k, v]) => `${k} ${v.kept === null ? 'none' : v.kept}${v.from === 'pooled' ? ' (pooled)' : ''} (moved ${v.moved ?? '?'} of ${v.rows}, lead ${v.lead ?? '?'}h)`).join(', ') : 'none: every stat waits for the last chance');
