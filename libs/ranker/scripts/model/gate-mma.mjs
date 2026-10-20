// The replay gate's MMA scoring, gate-mma.mjs (gate.mjs scoreVersion hands the fights league here; DECISIONS.md D22,
// D29; the owner, 2026-10-19: "Do we not have historical bet data on MMA? That's arguably more valuable than other
// sports."). A version of the fight model (fights-model.mjs, fights-totals.mjs) scored on every bout the archive has
// and on the priced history (The Odds API's opens and closes since 2020-06, matched to our bouts by fights-history.mjs),
// walk-forward with no look-ahead: each bout's chance from a fit on the bouts before its period alone (the rating as of
// its date already, rating.mjs rate replays oldest first), each priced row's trust from the months before it.
//
//   layer a   price-free: each bout's moneyline (the version's chance for ESPN's first fighter against the result,
//             a binary log loss; the rows the fit learns from: a winner, the fit's promotions, both fighters with a
//             bout before) and each bout's round totals at every line its rounds carry (fights-totals.mjs totalRows:
//             the chance it goes past the line against whether it did). Fits by half-year (PERIOD_MONTHS) from
//             LAYER_A_FROM, each on the rows before it, as the live desk refits on everything before each run.
//             Weighted by season (gate-score.mjs seasonWeight: the year; the current year and the two before decide)
//   layer b   the priced history: each matched bout's moneyline and round total at DraftKings, the open (the daily
//             snapshot's first sighting) and the close (the last before the bell, MMA_CLOSE_MAX at most), framed on
//             ESPN's first fighter (the model's side) and Over; fair Pinnacle's pair de-vigged where it posts the same
//             line, else DraftKings' own (as the live desk prices, mma-desk.mjs linesOf, fights-totals.mjs
//             totalLinesOf); the trust per market walk-forward by month (gate-history.mjs finish, walkTrust: desk.mjs
//             fitTrust, chanceAt). Measured as the team sports' history: betCompare on the open rows, vsBook at the
//             close, by market (the report's Raw / Priced / Book table)
//   ledger    the desk's own graded bets (apps/mma/src/StaticData/model/ledger.json) priced at the version's chance
//             and the history's trust as of their month: the scorecard's frozen and rolling sets
//   trust     BY LEAD BAND (the open round, 2026-10-19, DECISIONS.md D37: the owner's rule, the Bot picks its own time to
//             bet). The history's opens are the API's first sighting, a day to a month out, and the Bot's edge lives in
//             the early ones: measured on 3,052 open moneylines, two weeks or more out the Bot's own number beats the
//             Book's line 0.6389 to 0.6797 (the trust fit 0.25 to 0.3, the top picks' CLV +0.080, 54.5% beating the
//             close), 2 to 14 days out it ties or trails (trust 0), inside 48 hours the Book is far ahead (0.6715 to
//             0.5856), the close sharper still (0.6214 to 0.5804). So each priced row's trust is fit walk-forward by
//             month on the rows of its own lead band (leadBand: early two weeks or more out, mid 48 hours to two weeks,
//             late inside 48 hours and the close), the prior the live desk reads is one fit a band (trustPrior: the
//             rows carry their lead), and the desk prices a bout at the trust of its lead at the moment of the ask
//             (mma-desk.mjs trustFor). Written by gate.mjs --record to apps/mma/src/StaticData/model/trust-prior.json
//             with the rows to apps/mma/scripts/model/history-rows.json
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { keptFights } from '../../../../apps/mma/scripts/fights.mjs';
import { binLoss, gradeSide, r4, seasonWeight, topPicks } from './gate-score.mjs';
import { devig, finish, loadHistory, slim, vsBook, vsBookBySeason, walkTrust } from './gate-history.mjs';
import { closedEvents, matchHistory, matchReport } from './fights-history.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const SPORT = 'mma';
export const MARKETS = ['ml', 'total'];
// (the lead bands, hours before the start: early two weeks or more out, mid 48 hours to two weeks, late inside 48
// hours (the close among them))
export const LEAD_BANDS = { early: 336, mid: 48 };
export const BANDS = ['early', 'mid', 'late'];
// The pricing key of a market at a band (desk.mjs chanceAt, gapGuard and fitTrust read it for the taper and the gap):
// the early band's is the market's own name with "Open", a key desk.mjs GAP has no limit for, so the lean is whole
// and nothing is skipped as too far from the market. Measured 2026-10-19 on the 1,250 early moneylines: tapered, the
// trust fit 0.25 and the priced chance 0.6792 against the Book's 0.6797 (the lean past half the gap is cut, and 406
// of the rows sit past the gap itself, where the Bot's side wins 55.7% and its CLV is +0.455); untapered, the trust
// fit 0.75, the priced chance 0.6365, the top picks' CLV +0.288 and 58.6% beating the close. The early line is soft
// and the Bot's big disagreements with it are right; the mid and late bands keep the taper and the gap
export const priceKey = (market, band) => (band === 'early' ? `${market}Open` : market);
export const leadBand = (hours) => (!fin(hours) ? 'late' : hours >= LEAD_BANDS.early ? 'early' : hours >= LEAD_BANDS.mid ? 'mid' : 'late');
export const PERIOD_MONTHS = 6;
// (MMA's close: the last snapshot within this of the bout's start (D56, 2026-10-20). The archive's close snapshot is
// asked a minute before the first start of a cluster, and a card's bouts start hours apart, so a bout's last
// DraftKings price is often 6 to 12 hours before its own start: at the team sports' 6 hours (gate-history.mjs
// CLOSE_MAX) 35% of the replay's MMA bets had no close to check. Measured on the repaired archive (the Book's no-vig
// log loss at its last price by how long before the start): inside 1 hour 0.5929 on 1,918 bouts, 1 to 6 hours 0.5646
// on 101, 6 to 12 hours 0.5956 on 653 (as sharp as the bell), 12 to 24 hours 0.6540 on 305 (not a close))
export const MMA_CLOSE_MAX = 12 * 36e5;
// (a fit's bouts over by its period's first day plus this; a fighter's own bout over by its day plus this: the cards
// end past midnight UTC, Saturday nights in the Americas)
export const FIT_KNOWN_H = 8;
export const BOUT_KNOWN_H = 32;
export const LAYER_A_FROM = '2018-01-01';
// (the fit's rows at the least before a period is scored)
const MIN_TRAIN = 500;
const ROUND_SECS = 300;
const fin = Number.isFinite;
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));
const readJson = (file, fallback) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};
async function load(dir, name) {
  const file = path.join(dir, `${name}.mjs`);
  if (!existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}

// The periods from a date to now: [{ from, to }] (ISO days), PERIOD_MONTHS each
export function periodsOf(from, now = new Date()) {
  const out = [];
  let d = new Date(`${from}T00:00:00Z`);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  while (d < end) {
    const next = new Date(d);
    next.setUTCMonth(next.getUTCMonth() + PERIOD_MONTHS);
    out.push({ from: d.toISOString().slice(0, 10), to: next.toISOString().slice(0, 10) });
    d = next;
  }
  return out;
}

// Every bout's walk-forward chances by a version: Map fight id -> { p (the first fighter's), over(line, rounds) }, from
// the rows (fights-model.mjs buildRows) and the version's fits on the rows before each period. Also each period's
// fits (for the trust prior's note) and the rows scored
export function walkForward(V, rows, { from = LAYER_A_FROM, now = new Date(), log = () => {} } = {}) {
  const FM = V.fightsModel;
  const FT = V.fightsTotals;
  const all = FM.fitRows(rows);
  const tAll = FT.totalRows(rows);
  const out = new Map();
  const periods = [];
  // (each bout's chance by the period's fit and by the one before it: an open seen before its period began (a bout
  // early in a half-year, its line out a month before) reads the fit that was standing then (DECISIONS.md D48))
  let prev = null;
  const chanceBy = (fit, tfit, r, f) => ({ p: FM.predict(fit, r.x).p, over: (line, rounds) => (r.tx ? FT.predictTotal(tfit, r.tx, line, rounds ?? r.rounds, r.division)?.p ?? null : null), period: f });
  for (const { from: f, to } of periodsOf(from, now)) {
    const train = all.filter((r) => r.date < f);
    const inP = rows.filter((r) => r.date >= f && r.date < to);
    if (!inP.length || train.length < MIN_TRAIN) continue;
    const fit = FM.fitSoft(train);
    const tfit = FT.fitTotals(tAll.filter((r) => r.date < f));
    for (const r of inP) out.set(r.id, { ...chanceBy(fit, tfit, r, f), prev: prev ? chanceBy(prev.fit, prev.tfit, r, prev.f) : null });
    prev = { fit, tfit, f };
    periods.push({ from: f, to, train: train.length, bouts: inP.length, kept: fit.terms.filter((t) => t.weight).length });
    log(`fit before ${f}: ${train.length} bouts, ${inP.length} scored`);
  }
  return { chances: out, periods };
}

// Whether a bout went past a line (fights-totals.mjs pastLine); null where its length is unknown or it was a no contest
const pastLineOf = (r, line) => (r.secs === null || r.secs === undefined || r.method === 'NC' ? null : r.secs > line * ROUND_SECS ? 1 : 0);

// The priced history's rows for a version: the matched bouts' moneylines and round totals at the open and the close,
// framed on ESPN's first fighter and Over (see the header). { open, close, matched (the report) }
export function historyRows(V, rows, hist, chances, current, { fights = null } = {}) {
  const closed = closedEvents(hist, MMA_CLOSE_MAX);
  const { matched, unmatched } = matchHistory(hist.events, fights ?? [], { closed });
  const byFight = new Map(rows.map((r) => [r.id, r]));
  const by = new Map();
  for (const l of hist.lines) {
    if (l.kind !== 'o' && l.kind !== 'c') continue;
    const k = `${l.oid}|${l.kind}`;
    const m = by.get(k) ?? by.set(k, {}).get(k);
    ((m[l.book] ??= {})[l.market] ??= []).push(l);
  }
  const out = [];
  // (DECISIONS.md D48, no look-ahead by timestamp: a row's price read the fit's bouts (those dated before its period
  // began, over by that day's end: FIT_KNOWN_H past its midnight) and both fighters' own bouts before this one (each
  // over by BOUT_KNOWN_H past its day's midnight); an open seen before its period's fit read the one before it
  // (walkForward's prev). factsAt the latest of them: an open whose price read later facts is never bet there)
  const lastBout = new Map();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) for (const id of [r.a, r.b]) (lastBout.get(String(id)) ?? lastBout.set(String(id), []).get(String(id))).push(r.date);
  const before = (id, day) => {
    const list = lastBout.get(String(id)) ?? [];
    let d = null;
    for (const x of list) {
      if (x < day) d = x;
      else break;
    }
    return d;
  };
  const seenBy = (x, ts) => !!x && fin(Date.parse(x.ts)) && Date.parse(x.ts) <= Date.parse(ts);
  const dayEnd = (d, h) => (d ? Date.parse(`${d}T00:00:00Z`) + h * 36e5 : null);
  for (const [k, books] of by) {
    const [oid, kind] = k.split('|');
    const m = matched.get(oid);
    const e = hist.events.get(oid);
    if (!m || !e) continue;
    const r = byFight.get(m.fight.id);
    const c0 = chances.get(m.fight.id);
    if (!r || !c0) continue;
    const dk = books.dk;
    if (!dk) continue;
    const start = Date.parse(e.t);
    const ts = Date.parse(Object.values(dk)[0][0].ts);
    const fitAt = (x) => dayEnd(x.period, FIT_KNOWN_H);
    const c = fin(ts) && c0.prev && ts < fitAt(c0) ? c0.prev : c0;
    const fighters = Math.max(dayEnd(before(r.a, r.date), BOUT_KNOWN_H) ?? -Infinity, dayEnd(before(r.b, r.date), BOUT_KNOWN_H) ?? -Infinity);
    const factsAt = Math.max(fitAt(c), fighters);
    if (kind === 'c' && start - ts > MMA_CLOSE_MAX) continue;
    const season = e.season;
    const w = seasonWeight(SPORT, season, current).w;
    const lead = fin(ts) ? (start - ts) / 36e5 : kind === 'c' ? 1 : null;
    const base = { factsAt: fin(factsAt) ? factsAt : null, event: String(m.fight.id), sport: SPORT, kind, names: Array.isArray(m.fight.fighters) ? m.fight.fighters.map((f) => f?.name ?? null) : null, day: etDay(start), t: start, at: fin(ts) ? ts : null, lead: fin(lead) ? Math.round(lead * 10) / 10 : null, band: kind === 'c' ? 'late' : leadBand(lead), season, w, q: null };
    // (each market's own snapshot: a book's first sighting is by market, so a row's time, lead and band are its own)
    const timeOf = (x) => {
      const at = Date.parse(x.ts);
      if (!fin(at)) return {};
      const ld = (start - at) / 36e5;
      return { at, lead: Math.round(ld * 10) / 10, band: kind === 'c' ? 'late' : leadBand(ld) };
    };
    // (the moneyline: the API's a its first side, b its second; ESPN's first fighter is a unless crossed)
    const h2h = dk.h2h?.[0];
    if (h2h && fin(h2h.a) && fin(h2h.b)) {
      const mine = m.crossed ? h2h.b : h2h.a;
      const theirs = m.crossed ? h2h.a : h2h.b;
      // (Pinnacle's only where seen by DraftKings' own snapshot (D48: each book's open is its own first sighting))
      const pin = seenBy(books.pin?.h2h?.[0], h2h.ts) ? books.pin.h2h[0] : null;
      const fair = pin && fin(pin.a) && fin(pin.b) ? devig(m.crossed ? pin.b : pin.a, m.crossed ? pin.a : pin.b) : devig(mine, theirs);
      if (fin(c.p)) out.push({ ...base, ...timeOf(h2h), id: `h:${m.fight.id}:ml:${kind}`, key: `h:${m.fight.id}:ml`, market: 'ml', stat: 'ml', line: null, f: fair, raw: Math.min(0.999, Math.max(0.001, c.p)), y: r.y, overOdds: mine, underOdds: theirs, fairFrom: pin ? 'pinnacle' : 'dk' });
    }
    // (the round total: the book's main line, the one nearest even where it posts several)
    const tots = (dk.totals ?? []).filter((x) => fin(x.line) && fin(x.a) && fin(x.b));
    if (tots.length) {
      const t = [...tots].sort((x, y) => Math.abs(devig(x.a, x.b) - 0.5) - Math.abs(devig(y.a, y.b) - 0.5))[0];
      const pin = (books.pin?.totals ?? []).find((x) => x.line === t.line && fin(x.a) && fin(x.b) && seenBy(x, t.ts));
      const fair = pin ? devig(pin.a, pin.b) : devig(t.a, t.b);
      const raw = c.over(t.line, r.rounds);
      if (fin(raw)) out.push({ ...base, ...timeOf(t), id: `h:${m.fight.id}:total:${kind}`, key: `h:${m.fight.id}:total`, market: 'total', stat: 'total', line: t.line, f: fair, raw: Math.min(0.999, Math.max(0.001, raw)), y: pastLineOf(r, t.line), overOdds: t.a, underOdds: t.b, fairFrom: pin ? 'pinnacle' : 'dk' });
    }
  }
  const priced = finishByLead(V, out);
  return { ...priced, report: matchReport(hist.events, matched, unmatched, fights ?? [], closed), matched };
}

// The rows priced, each at the trust of its own lead band fit walk-forward by month on the band's rows before (the
// open rows' close chance at the same line as q, the close rows' open as fo, as gate-history.mjs finish links them;
// desk.mjs chanceAt with the row as its ctx). { open, close }
export function finishByLead(V, rows, { start = 0.5 } = {}) {
  // (the harness's champion for the bands themselves: MMA_LEAD_BANDS=0 prices every row at one trust a market fit on
  // the closes, as the team sports' history is (gate-history.mjs finish): gate.mjs --champion env:MMA_LEAD_BANDS=0)
  if (process.env.MMA_LEAD_BANDS === '0') return finish(V, rows, (x) => x.market, () => start, 'lines');
  const close = new Map(rows.filter((x) => x.kind === 'c').map((x) => [x.key, x]));
  const open = new Map(rows.filter((x) => x.kind === 'o').map((x) => [x.key, x]));
  for (const x of rows) {
    const other = x.kind === 'o' ? close.get(x.key) : open.get(x.key);
    if (!other || !(other.line === x.line || (other.line === null && x.line === null))) continue;
    if (x.kind === 'o') x.q = other.f;
    else x.fo = other.f;
  }
  // (each row fit and priced by its band's key: the early band untapered, priceKey)
  const keyed = rows.map((x) => ({ ...x, market: priceKey(x.market, x.band) }));
  const trust = walkTrust(keyed, (x) => `${x.market}@${x.band}`, V.desk.fitTrust, () => start);
  // (an open at the trust as of its own snapshot: the months before the snapshot's, no result after it (D48))
  for (const [i, x] of rows.entries()) {
    const t = x.kind === 'o' && fin(x.at) ? trust.at(`${priceKey(x.market, x.band)}@${x.band}`, x.at) : (trust.get(keyed[i]) ?? start);
    const ctx = { sport: x.sport, market: priceKey(x.market, x.band), stat: x.stat, line: x.line, side: 'over', f: x.f, raw: x.raw, overOdds: x.overOdds, underOdds: x.underOdds, t: x.t, at: fin(x.at) ? x.at : x.t - (x.kind === 'o' ? 24 * 36e5 : 36e5), kind: x.kind, fo: x.fo ?? null, home: null, season: x.season };
    x.p = Math.min(0.999, Math.max(0.001, V.desk.chanceAt(priceKey(x.market, x.band), x.f, x.raw, t, ctx)));
    x.trust = t;
  }
  return { open: rows.filter((x) => x.kind === 'o'), close: rows.filter((x) => x.kind === 'c') };
}

// The ledger's graded moneylines and round totals as the gate's rows, each priced by the version's chance at the trust
// (the history's as of the bet's month, or its newest): { id, event, sport, stat, line, day, t, f, p, y, q, overOdds,
// underOdds, units, intent, src 'ledger' }. chanceOf(bet): the version's chance of the bet's side, or null (the saved)
export function ledgerRows(V, ledger, trustOf, { from = '2026-10-08T00:00:00Z', chanceOf = () => null } = {}) {
  const out = [];
  for (const b of ledger?.bets ?? []) {
    if (!b || b.void || !MARKETS.includes(b.market ?? 'ml') || !fin(b.fair) || !fin(b.model)) continue;
    if (Date.parse(b.start) < Date.parse(from)) continue;
    const decided = b.status === 'won' || b.status === 'lost';
    if (!decided && !fin(b.clv?.q)) continue;
    const market = b.market ?? 'ml';
    const m = chanceOf(b) ?? b.model;
    const t = trustOf(market, Date.parse(b.start), b.line, (Date.parse(b.start) - Date.parse(b.placedAt ?? b.start)) / 36e5);
    const p = Math.min(0.999, Math.max(0.001, V.desk.chanceAt(priceKey(market, leadBand((Date.parse(b.start) - Date.parse(b.placedAt ?? b.start)) / 36e5)), b.fair, m, t)));
    out.push({ id: String(b.id), event: String(b.event ?? b.id), sport: SPORT, stat: market, line: b.line ?? null, day: etDay(Date.parse(b.start)), t: Date.parse(b.start), f: b.fair, p, raw: m, y: b.status === 'won' ? 1 : b.status === 'lost' ? 0 : null, q: fin(b.clv?.q) ? b.clv.q : null, overOdds: b.odds, underOdds: fin(b.otherOdds) ? b.otherOdds : null, units: fin(b.units) ? b.units : 0, intent: b.intent ?? null, src: 'ledger', trust: t });
  }
  return out;
}

// The history's rows as the trust fit reads a bet (desk.mjs fitTrust: the market, the model's chance, the Book's
// no-vig, the result, the close's chance; tw its season's weight, recency): the open rows (a price a week or more
// out, the result and the close) and the close rows (the bell's price and the result) both, each its own evidence.
// The live desk bets inside 72 hours, between the two: measured 2026-10-19, the moneyline's trust fit on the opens
// alone is 0.15 (the Bot's own number beats the opening line: 0.6362 to 0.6478 on 1,968 bouts) and on the closes
// alone 0 (the close is far sharper: 0.5987), so the pool reads the moment between
export function trustBets(open, close, current) {
  const rows = [...open, ...close];
  return rows
    .filter((x) => x.y === 0 || x.y === 1 || fin(x.q))
    .map((x) => ({ id: x.id, event: x.event, market: x.market, line: x.line, model: x.raw, fair: x.f, status: x.y === 1 ? 'won' : x.y === 0 ? 'lost' : 'push', ...(fin(x.q) ? { clv: { q: x.q } } : {}), start: new Date(x.t).toISOString(), season: x.season, kind: x.kind, lead: x.lead ?? null, band: x.band ?? leadBand(x.lead), tw: seasonWeight(SPORT, x.season, current).w }));
}

// The history prior for the live desk (mma-desk.mjs readTrustPrior): each market's trust fit on the history's rows,
// recency-weighted (fitTrust reads tw), with the rows' counts; the totals' by the line's size too (fitBuckets' rungs
// need the pool: the desk fits them with the rows, this is the readout)
export function trustPrior(V, bets, { start = 0.5 } = {}) {
  const out = {};
  const fitOf = (mine) => {
    const f = V.desk.fitTrust(mine, start);
    return { trust: f.trust, n: f.n, clvN: f.clvN, eff: f.eff, fitted: f.fitted, logLoss: f.logLoss ?? null, rows: mine.length, from: mine.length ? mine.reduce((a, b) => (a < b.start ? a : b.start), mine[0].start).slice(0, 10) : null, to: mine.length ? mine.reduce((a, b) => (a > b.start ? a : b.start), mine[0].start).slice(0, 10) : null };
  };
  for (const market of MARKETS) {
    const mine = bets.filter((b) => b.market === market);
    // (the market's own line is the late band's (the close's: what the desk prices at the bell); each band its fit)
    const bands = Object.fromEntries(BANDS.map((band) => [band, fitOf(mine.filter((b) => (b.band ?? leadBand(b.lead)) === band).map((b) => ({ ...b, market: priceKey(market, band) })))]));
    out[market] = { ...bands.late, rows: mine.length, all: fitOf(mine), bands };
  }
  return out;
}

// (the history's rows, compact, for the desk's pooled trust fit: [market, event, start, season, line, model, fair, y,
// q, kind]; back to bets with rowsToBets)
export const packRows = (bets) => bets.map((b) => [b.market, b.event, b.start, b.season, b.line ?? null, r4(b.model), r4(b.fair), b.status === 'won' ? 1 : b.status === 'lost' ? 0 : null, fin(b.clv?.q) ? r4(b.clv.q) : null, b.kind ?? null, fin(b.lead) ? Math.round(b.lead * 10) / 10 : null]);
export const unpackRows = (packed, current) =>
  (packed ?? []).map(([market, event, start, season, line, model, fair, y, q, kind, lead]) => ({ id: `${event}:${market}:${kind ?? 'o'}`, event, market, line, model, fair, status: y === 1 ? 'won' : y === 0 ? 'lost' : 'push', ...(fin(q) ? { clv: { q } } : {}), start, season, kind, lead: fin(lead) ? lead : kind === 'c' ? 1 : null, band: fin(lead) ? leadBand(lead) : kind === 'c' ? 'late' : 'mid', tw: seasonWeight(SPORT, season, current).w }));

// The open rows' top picks (3 a card, as the desk's practice picks) against the open-to-close move: how many beat the
// close (their CLV over 0), their mean CLV, their units at the practice stake and hit; all and by lead band. The
// owner's measure for betting early (D37)
export function beatClose(open, { n = 3, practice = 0.5 } = {}) {
  const sum = (rows) => {
    const picks = topPicks(rows, n).map((s) => ({ ...s, g: gradeSide(s.x, s.side) }));
    const q = picks.filter((s) => fin(s.g.clv));
    const d = picks.filter((s) => s.g.won !== null);
    if (!picks.length) return null;
    return { picks: picks.length, beat: q.length ? r4(q.filter((s) => s.g.clv > 0).length / q.length) : null, clv: q.length ? r4(q.reduce((t, s) => t + s.g.clv, 0) / q.length) : null, hit: d.length ? r4(d.filter((s) => s.g.won).length / d.length) : null, units: r4(d.reduce((t, s) => t + practice * s.g.profit, 0)) };
  };
  const out = {};
  for (const m of MARKETS) out[m] = { all: sum(open.filter((x) => x.market === m)), ...Object.fromEntries(BANDS.map((band) => [band, sum(open.filter((x) => x.market === m && x.band === band))])) };
  return out;
}

// One version's MMA score: the same shape as gate.mjs scoreVersion's, with proj.bouts and proj.totals in place of games
// and props, bet.lines the ledger's, bet.history the priced history's, vsBook by market, and the trust prior
export async function scoreMma(dir, { log = console.log, now = new Date() } = {}) {
  const notes = [];
  const say = (s) => (notes.push(s), log(`${SPORT}: ${s}`));
  const V = {};
  // (picks, replay: the bands and the replayed record (replay-record.mjs); a version from before them has none)
  for (const [k, n] of [['leagues', 'leagues'], ['desk', 'desk'], ['fightsModel', 'fights-model'], ['fightsTotals', 'fights-totals'], ['mmaDesk', 'mma-desk'], ['picks', 'picks'], ['replay', 'replay-record']]) V[k] = await load(dir, n);
  if (!V.fightsModel || !V.fightsTotals) throw new Error(`${dir}: no fights model (fights-model.mjs, fights-totals.mjs)`);
  const fights = (await keptFights()).filter((f) => f.date <= now.toISOString().slice(0, 10));
  const { cache } = V.fightsModel.loadKept();
  const { rows } = V.fightsModel.buildRows(fights, cache);
  const current = Math.max(...rows.filter((r) => r.y !== null).map((r) => Number(r.date.slice(0, 4))));
  const t0 = Date.now();
  const { chances, periods } = walkForward(V, rows, { now, log: (s) => log(`  ${SPORT}: ${s}`) });
  say(`${rows.length} bouts in the archive, ${chances.size} scored walk-forward over ${periods.length} half-years from ${periods[0]?.from ?? '-'} in ${Math.round((Date.now() - t0) / 1000)}s`);
  // (layer a: each fit-eligible bout's moneyline, and its round totals at each line its rounds carry)
  const fitIds = new Set(V.fightsModel.fitRows(rows).map((r) => r.id));
  const bouts = [];
  const totals = [];
  for (const r of rows) {
    const c = chances.get(r.id);
    if (!c || !fitIds.has(r.id)) continue;
    const season = Number(r.date.slice(0, 4));
    const day = r.date;
    if (r.y === 0 || r.y === 1) bouts.push([r.id, day, season, r4(binLoss(c.p, r.y)), r4(binLoss(r.ratingP, r.y))]);
    for (const t of V.fightsTotals.totalRows([r])) {
      const p = c.over(t.line, t.rounds);
      if (fin(p)) totals.push([`${r.id}|${t.line}`, day, season, r4(binLoss(p, t.y)), t.line]);
    }
  }
  say(`bouts: ${bouts.length} moneylines and ${totals.length} round-total lines scored (seasons ${[...new Set(bouts.map((b) => b[2]))].sort().join(', ')})`);
  // (layer b: the priced history)
  const hist = loadHistory(SPORT);
  let histRows = { open: [], close: [], report: null };
  if (hist.events.size) {
    histRows = historyRows(V, rows, hist, chances, current, { fights });
    const rep = histRows.report;
    say(`history: ${rep.matched} of ${rep.total} events matched to a bout (${rep.closedMatched} of ${rep.closed} priced to the bell, ${(rep.closedRate * 100).toFixed(1)}%); ${histRows.close.length} closes and ${histRows.open.length} opens priced (${histRows.close.filter((x) => x.market === 'ml').length} moneylines, ${histRows.close.filter((x) => x.market === 'total').length} round totals at the close)`);
  } else say('history: none committed (odds-history.mjs)');
  // (the trust: walk-forward on the rows (finish), and the prior on all of them)
  const tb = trustBets(histRows.open, histRows.close, current);
  const prior = trustPrior(V, tb);
  say(`the history's trust by lead band: ${MARKETS.map((m) => `${m} ${BANDS.map((band) => `${band} ${prior[m].bands[band].trust} (${prior[m].bands[band].rows} rows)`).join(', ')}`).join('; ')}`);
  // (the ledger: the desk's own rows at the history's trust as of their month (the newest month's where after it))
  const trustAt = (market, t, line, lead) => {
    const band = leadBand(lead);
    const mine = [...histRows.open, ...histRows.close].filter((x) => x.market === market && x.band === band && x.t <= t && fin(x.trust));
    if (!mine.length) return prior[market]?.bands?.[band]?.trust ?? 0.5;
    return mine.reduce((a, b) => (a.t > b.t ? a : b)).trust;
  };
  const ledger = readJson(path.join(ROOT, 'apps', SPORT, 'src/StaticData/model/ledger.json'), { bets: [] });
  const byFight = new Map(rows.map((r) => [r.id, r]));
  const chanceOf = (b) => {
    const r = byFight.get(String(b.event));
    const c = r ? chances.get(r.id) : null;
    if (!r || !c) return null;
    // (the ledger's home is ESPN's first fighter as the desk read it: the archive's first may be the other)
    const fid = b.fighters?.[b.side]?.id ?? null;
    if (b.market === 'total') {
      const o = c.over(b.line, r.rounds);
      return fin(o) ? (b.side === 'over' ? o : 1 - o) : null;
    }
    if (!fid) return null;
    const first = String(r.a) === String(fid);
    const second = String(r.b) === String(fid);
    return first ? c.p : second ? 1 - c.p : null;
  };
  const lines = ledgerRows(V, ledger, trustAt, { chanceOf });
  say(`ledger: ${lines.length} graded rows priced at the history's trust`);
  const practiceN = V.desk.PRACTICE_N?.[SPORT] ?? 3;
  const vs = {
    lines: vsBook(histRows.close),
    props: null,
    linesBySeason: vsBookBySeason(histRows.close),
    linesByMarket: Object.fromEntries(MARKETS.map((m) => [m, vsBook(histRows.close.filter((x) => x.market === m))])),
    // (the open too: what the desk bets at; and by lead band)
    openByMarket: Object.fromEntries(MARKETS.map((m) => [m, vsBook(histRows.open.filter((x) => x.market === m))])),
    openByBand: Object.fromEntries(MARKETS.map((m) => [m, Object.fromEntries(BANDS.map((band) => [band, vsBook([...histRows.open, ...histRows.close].filter((x) => x.market === m && x.band === band))]))])),
    beat: beatClose(histRows.open, { n: practiceN, practice: V.desk.PRACTICE_UNITS ?? 0.5 }),
  };
  // (the replayed record (replay-record.mjs): the bouts this version would have bet over the priced history before
  // MMA_START, each at its lead band's price as the archive has it)
  let replay = null;
  if (V.replay?.replayRecord && histRows.close.length) {
    const names = (x) => ({ home: x.names?.[0] ?? 'Fighter A', away: x.names?.[1] ?? 'Fighter B', matchup: `${x.names?.[0] ?? 'Fighter A'} vs ${x.names?.[1] ?? 'Fighter B'}` });
    replay = V.replay.replayRecord(V, SPORT, { open: histRows.open, close: histRows.close }, { events: null, names, epoch: V.mmaDesk?.MMA_START ?? V.leagues?.MODEL_EPOCH ?? null });
    say(`replayed record: ${replay.overall.won}-${replay.overall.lost}-${replay.overall.push} ${replay.overall.profit >= 0 ? '+' : ''}${replay.overall.profit}u on ${replay.n.bets} bets (${replay.flags.timing.open} at the open, ${replay.flags.timing.close} at the close), ${replay.n.practice} practice picks`);
  }
  return {
    sport: SPORT,
    notes,
    current,
    code: null,
    epoch: V.mmaDesk?.MMA_START ?? V.leagues?.MODEL_EPOCH ?? null,
    replay,
    proj: { bouts, totals },
    bet: { props: { saved: [], replay: null }, lines: { saved: lines, replay: lines.length ? lines : null }, history: { saved: [], replay: slim([...histRows.open]) } },
    vsBook: vs,
    anchor: null,
    trustPrior: { ...prior, rows: packRows(tb), periods, match: histRows.report ? { total: histRows.report.total, matched: histRows.report.matched, closed: histRows.report.closed, closedMatched: histRows.report.closedMatched, rate: histRows.report.rate, closedRate: histRows.report.closedRate } : null },
    meta: { practiceN, practiceUnits: V.desk.PRACTICE_UNITS ?? 0.5, trust: Object.fromEntries(MARKETS.map((m) => [m, Object.fromEntries(BANDS.map((band) => [band, prior[m].bands[band].trust]))])), matched: chances.size, priced: lines.length },
  };
}
