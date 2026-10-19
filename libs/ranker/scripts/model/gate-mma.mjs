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
//             snapshot's first sighting) and the close (the last before the bell, CLOSE_MAX at most), framed on
//             ESPN's first fighter (the model's side) and Over; fair Pinnacle's pair de-vigged where it posts the same
//             line, else DraftKings' own (as the live desk prices, mma-desk.mjs linesOf, fights-totals.mjs
//             totalLinesOf); the trust per market walk-forward by month (gate-history.mjs finish, walkTrust: desk.mjs
//             fitTrust, chanceAt). Measured as the team sports' history: betCompare on the open rows, vsBook at the
//             close, by market (the report's Raw / Priced / Book table)
//   ledger    the desk's own graded bets (apps/mma/src/StaticData/model/ledger.json) priced at the version's chance
//             and the history's trust as of their month: the scorecard's frozen and rolling sets
//   trust     the history's own fit of each market's trust (fitTrust on its open rows, recency-weighted by season:
//             the history prior the live desk reads, mma-desk.mjs; written by gate.mjs --record to
//             apps/mma/src/StaticData/model/trust-prior.json with the rows to apps/mma/scripts/model/history-rows.json)
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { keptFights } from '../../../../apps/mma/scripts/fights.mjs';
import { binLoss, r4, seasonWeight } from './gate-score.mjs';
import { CLOSE_MAX, devig, finish, loadHistory, slim, vsBook, vsBookBySeason } from './gate-history.mjs';
import { closedEvents, matchHistory, matchReport } from './fights-history.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const SPORT = 'mma';
export const MARKETS = ['ml', 'total'];
export const PERIOD_MONTHS = 6;
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
  for (const { from: f, to } of periodsOf(from, now)) {
    const train = all.filter((r) => r.date < f);
    const inP = rows.filter((r) => r.date >= f && r.date < to);
    if (!inP.length || train.length < MIN_TRAIN) continue;
    const fit = FM.fitSoft(train);
    const tfit = FT.fitTotals(tAll.filter((r) => r.date < f));
    for (const r of inP) out.set(r.id, { p: FM.predict(fit, r.x).p, over: (line, rounds) => (r.tx ? FT.predictTotal(tfit, r.tx, line, rounds ?? r.rounds)?.p ?? null : null), period: f });
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
  const closed = closedEvents(hist, CLOSE_MAX);
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
  for (const [k, books] of by) {
    const [oid, kind] = k.split('|');
    const m = matched.get(oid);
    const e = hist.events.get(oid);
    if (!m || !e) continue;
    const r = byFight.get(m.fight.id);
    const c = chances.get(m.fight.id);
    if (!r || !c) continue;
    const dk = books.dk;
    if (!dk) continue;
    const start = Date.parse(e.t);
    const ts = Date.parse(Object.values(dk)[0][0].ts);
    if (kind === 'c' && start - ts > CLOSE_MAX) continue;
    const season = e.season;
    const w = seasonWeight(SPORT, season, current).w;
    const base = { event: String(m.fight.id), sport: SPORT, kind, day: etDay(start), t: start, at: fin(ts) ? ts : null, season, w, q: null };
    // (the moneyline: the API's a its first side, b its second; ESPN's first fighter is a unless crossed)
    const h2h = dk.h2h?.[0];
    if (h2h && fin(h2h.a) && fin(h2h.b)) {
      const mine = m.crossed ? h2h.b : h2h.a;
      const theirs = m.crossed ? h2h.a : h2h.b;
      const pin = books.pin?.h2h?.[0];
      const fair = pin && fin(pin.a) && fin(pin.b) ? devig(m.crossed ? pin.b : pin.a, m.crossed ? pin.a : pin.b) : devig(mine, theirs);
      if (fin(c.p)) out.push({ ...base, id: `h:${m.fight.id}:ml:${kind}`, key: `h:${m.fight.id}:ml`, market: 'ml', stat: 'ml', line: null, f: fair, raw: Math.min(0.999, Math.max(0.001, c.p)), y: r.y, overOdds: mine, underOdds: theirs, fairFrom: pin ? 'pinnacle' : 'dk' });
    }
    // (the round total: the book's main line, the one nearest even where it posts several)
    const tots = (dk.totals ?? []).filter((x) => fin(x.line) && fin(x.a) && fin(x.b));
    if (tots.length) {
      const t = [...tots].sort((x, y) => Math.abs(devig(x.a, x.b) - 0.5) - Math.abs(devig(y.a, y.b) - 0.5))[0];
      const pin = (books.pin?.totals ?? []).find((x) => x.line === t.line && fin(x.a) && fin(x.b));
      const fair = pin ? devig(pin.a, pin.b) : devig(t.a, t.b);
      const raw = c.over(t.line, r.rounds);
      if (fin(raw)) out.push({ ...base, id: `h:${m.fight.id}:total:${kind}`, key: `h:${m.fight.id}:total`, market: 'total', stat: 'total', line: t.line, f: fair, raw: Math.min(0.999, Math.max(0.001, raw)), y: pastLineOf(r, t.line), overOdds: t.a, underOdds: t.b, fairFrom: pin ? 'pinnacle' : 'dk' });
    }
  }
  const priced = finish(V, out, (x) => x.market, () => 0.5, 'lines');
  return { ...priced, report: matchReport(hist.events, matched, unmatched, fights ?? [], closed), matched };
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
    const t = trustOf(market, Date.parse(b.start), b.line);
    const p = Math.min(0.999, Math.max(0.001, V.desk.chanceAt(market, b.fair, m, t)));
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
    .map((x) => ({ id: x.id, event: x.event, market: x.market, line: x.line, model: x.raw, fair: x.f, status: x.y === 1 ? 'won' : x.y === 0 ? 'lost' : 'push', ...(fin(x.q) ? { clv: { q: x.q } } : {}), start: new Date(x.t).toISOString(), season: x.season, kind: x.kind, tw: seasonWeight(SPORT, x.season, current).w }));
}

// The history prior for the live desk (mma-desk.mjs readTrustPrior): each market's trust fit on the history's rows,
// recency-weighted (fitTrust reads tw), with the rows' counts; the totals' by the line's size too (fitBuckets' rungs
// need the pool: the desk fits them with the rows, this is the readout)
export function trustPrior(V, bets, { start = 0.5 } = {}) {
  const out = {};
  for (const market of MARKETS) {
    const mine = bets.filter((b) => b.market === market);
    const f = V.desk.fitTrust(mine, start);
    out[market] = { trust: f.trust, n: f.n, clvN: f.clvN, eff: f.eff, fitted: f.fitted, logLoss: f.logLoss ?? null, rows: mine.length, from: mine.length ? mine.reduce((a, b) => (a < b.start ? a : b.start), mine[0].start).slice(0, 10) : null, to: mine.length ? mine.reduce((a, b) => (a > b.start ? a : b.start), mine[0].start).slice(0, 10) : null };
  }
  return out;
}

// (the history's rows, compact, for the desk's pooled trust fit: [market, event, start, season, line, model, fair, y,
// q, kind]; back to bets with rowsToBets)
export const packRows = (bets) => bets.map((b) => [b.market, b.event, b.start, b.season, b.line ?? null, r4(b.model), r4(b.fair), b.status === 'won' ? 1 : b.status === 'lost' ? 0 : null, fin(b.clv?.q) ? r4(b.clv.q) : null, b.kind ?? null]);
export const unpackRows = (packed, current) =>
  (packed ?? []).map(([market, event, start, season, line, model, fair, y, q, kind]) => ({ id: `${event}:${market}:${kind ?? 'o'}`, event, market, line, model, fair, status: y === 1 ? 'won' : y === 0 ? 'lost' : 'push', ...(fin(q) ? { clv: { q } } : {}), start, season, kind, tw: seasonWeight(SPORT, season, current).w }));

// One version's MMA score: the same shape as gate.mjs scoreVersion's, with proj.bouts and proj.totals in place of games
// and props, bet.lines the ledger's, bet.history the priced history's, vsBook by market, and the trust prior
export async function scoreMma(dir, { log = console.log, now = new Date() } = {}) {
  const notes = [];
  const say = (s) => (notes.push(s), log(`${SPORT}: ${s}`));
  const V = {};
  for (const [k, n] of [['leagues', 'leagues'], ['desk', 'desk'], ['fightsModel', 'fights-model'], ['fightsTotals', 'fights-totals'], ['mmaDesk', 'mma-desk']]) V[k] = await load(dir, n);
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
  say(`the history's trust: ${MARKETS.map((m) => `${m} ${prior[m].trust} (${prior[m].n} graded, ${prior[m].clvN} closes, eff ${prior[m].eff})`).join('; ')}`);
  // (the ledger: the desk's own rows at the history's trust as of their month (the newest month's where after it))
  const trustAt = (market, t, line) => {
    const mine = histRows.close.filter((x) => x.market === market && x.t <= t && fin(x.trust));
    if (!mine.length) return prior[market]?.trust ?? 0.5;
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
    // (the open too: what the desk bets at)
    openByMarket: Object.fromEntries(MARKETS.map((m) => [m, vsBook(histRows.open.filter((x) => x.market === m))])),
  };
  return {
    sport: SPORT,
    notes,
    current,
    code: null,
    epoch: V.mmaDesk?.MMA_START ?? V.leagues?.MODEL_EPOCH ?? null,
    proj: { bouts, totals },
    bet: { props: { saved: [], replay: null }, lines: { saved: lines, replay: lines.length ? lines : null }, history: { saved: [], replay: slim([...histRows.open]) } },
    vsBook: vs,
    anchor: null,
    trustPrior: { ...prior, rows: packRows(tb), periods, match: histRows.report ? { total: histRows.report.total, matched: histRows.report.matched, closed: histRows.report.closed, closedMatched: histRows.report.closedMatched, rate: histRows.report.rate, closedRate: histRows.report.closedRate } : null },
    meta: { practiceN, practiceUnits: V.desk.PRACTICE_UNITS ?? 0.5, trust: Object.fromEntries(MARKETS.map((m) => [m, prior[m].trust])), matched: chances.size, priced: lines.length },
  };
}
