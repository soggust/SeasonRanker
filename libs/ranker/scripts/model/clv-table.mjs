// The closing-line value scorecard (DECISIONS.md D115, 2026-11-08): the Bot's one honest measure of whether it is early
// or late to the market, by sport, market and book. For every staked, graded bet with a close at its own line (clv.mjs
// clvOf v3): the mean CLV in probability points (the close's no-vig chance of its side less the chance its own price
// implied), the same in cents of American odds, the share that beat the close, and the flat return beside it.
//
//   the rows   sport x market (spread, total, ml, each prop stat as prop:<key>) x book (the book the bet was taken at),
//              with an "all" row for each market and for the sport; bets the staked graded bets (intent not 'track',
//              units over 0, won, lost or pushed), judged those with a CLV (a close at their line and a price), moved
//              the lines that moved (never judged), noClose the rest; ROI the return on every graded stake in the group
//   the desk   run.mjs captureClose logs the sport's table every run; saveState writes the rows to state.json
//              (clvTable) for the Algorithm tab
//   standalone node libs/ranker/scripts/model/clv-table.mjs [nfl nba nhl mlb] [--regrade [--dry] [--no-archive]]
//              prints each sport's table as markdown from its ledger. --regrade values every ledger row's clv again
//              under the current definition (clv.mjs CLV_V) from the close it kept, Pinnacle's archived close
//              (odds-history.mjs, the bought history and nothing bought here) in place of DraftKings' where the archive
//              has one at the bet's line, and writes the ledgers (--dry: prints what would change). Nothing here calls
//              The Odds API or runs the bettor.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLV_V, clvOf, sharpClose } from './clv.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const r2 = (v) => (fin(v) ? Math.round(v * 100) / 100 : null);
const r1 = (v) => (fin(v) ? Math.round(v * 10) / 10 : null);
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const implied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const devig = (a, b) => implied(a) / (implied(a) + implied(b));

export const TABLE_SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];
export const ledgerFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'src/StaticData/model/ledger.json');
// (a ledger's rows: an array, { bets: [...] }, or an object whose array is the rows)
export const betsOf = (raw) => (Array.isArray(raw) ? raw : Array.isArray(raw?.bets) ? raw.bets : (Object.values(raw ?? {}).find(Array.isArray) ?? []));
// (a bet the scorecard counts: staked and graded)
export const scored = (b) => !!b && !b.void && b.intent !== 'track' && b.units > 0 && ['won', 'lost', 'push'].includes(b.status);
export const marketKey = (b) => (b.market === 'prop' ? `prop:${b.propType ?? 'prop'}` : b.market);
const MARKET_ORDER = { spread: 0, total: 1, ml: 2 };
const marketRank = (m) => (m === 'all' ? -1 : (MARKET_ORDER[m] ?? 3));

// ---- the table ----

const empty = (sport, market, book) => ({ sport, market, book, bets: 0, judged: 0, beats: 0, misses: 0, ties: 0, moved: 0, noClose: 0, probSum: 0, centsSum: 0, staked: 0, profit: 0 });
function add(g, b) {
  g.bets++;
  g.staked += b.units;
  g.profit += fin(b.profit) ? b.profit : 0;
  const c = b.clv;
  if (c && fin(c.prob)) {
    g.judged++;
    g.probSum += c.prob;
    g.centsSum += fin(c.cents) ? c.cents : 0;
    if (c.beat === true) g.beats++;
    else if (c.beat === false) g.misses++;
    else g.ties++;
  } else if (c && (c.line === 'moved' || c.result === 'line moved')) g.moved++;
  else g.noClose++;
}
const finish = (g) => ({
  sport: g.sport,
  market: g.market,
  book: g.book,
  bets: g.bets,
  judged: g.judged,
  prob: g.judged ? r4(g.probSum / g.judged) : null,
  cents: g.judged ? r1(g.centsSum / g.judged) : null,
  beat: g.judged ? r4(g.beats / g.judged) : null,
  missed: g.judged ? r4(g.misses / g.judged) : null,
  tie: g.judged ? r4(g.ties / g.judged) : null,
  moved: g.moved,
  noClose: g.noClose,
  staked: r2(g.staked),
  profit: r2(g.profit),
  roi: g.staked > 0 ? r4(g.profit / g.staked) : null,
});

// A sport's rows: every market x book with a staked graded bet, each market's "all" and the sport's; sorted the lines
// first (spread, total, ml), then the prop stats by name, "all" at the head of each market, the books by bets
export function clvTable(bets, sport) {
  const groups = new Map();
  const at = (market, book) => {
    const key = `${market}|${book}`;
    return groups.get(key) ?? groups.set(key, empty(sport, market, book)).get(key);
  };
  for (const b of bets ?? []) {
    if (!scored(b) || (sport && b.sport && b.sport !== sport)) continue;
    const m = marketKey(b);
    const book = b.book ?? 'unknown';
    add(at(m, book), b);
    add(at(m, 'all'), b);
    add(at('all', 'all'), b);
  }
  return [...groups.values()]
    .map(finish)
    .sort((a, b) => marketRank(a.market) - marketRank(b.market) || a.market.localeCompare(b.market) || (a.book === 'all' ? -1 : b.book === 'all' ? 1 : b.bets - a.bets || a.book.localeCompare(b.book)));
}

const pct = (v, d = 1) => (fin(v) ? `${(v * 100).toFixed(d)}%` : '—');
const signed = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}` : '—');
// The rows as markdown (the desk's log, the standalone print): one table a sport, the market's "all" row in bold
export function clvTableText(rows, { title = null, books = true } = {}) {
  const out = [];
  if (title) out.push(title);
  out.push('| market | book | bets | judged | mean CLV (pts) | mean cents | beat | ROI |', '|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    if (!books && r.book !== 'all') continue;
    const name = r.market === 'all' ? 'all markets' : r.market;
    const cell = (s) => (r.book === 'all' ? `**${s}**` : s);
    out.push(`| ${cell(name)} | ${r.book === 'all' ? 'all books' : r.book} | ${r.bets} | ${r.judged}${r.moved ? ` (+${r.moved} line moved)` : ''} | ${cell(signed(fin(r.prob) ? r.prob * 100 : null))} | ${cell(signed(r.cents, 1))} | ${cell(pct(r.beat))} | ${cell(pct(r.roi))} |`);
  }
  return out.join('\n');
}

// ---- the archive's closes (the re-grade) ----

// The archived closes on a sport's bets (odds-history.mjs readHistory: the bought history's close snapshot, a minute
// before the start, Pinnacle's and DraftKings'): Map bet id -> [{ book, line, odds, fair }] at the bet's own line
// and side. Nothing bought: the committed files alone
export async function archiveCloses(sport, bets) {
  const out = new Map();
  const mine = (bets ?? []).filter((b) => b.event && b.market);
  if (!mine.length) return out;
  const { readHistory } = await import('./odds-history.mjs');
  const { API_MARKETS } = await import('./props.mjs');
  const { nameParts } = await import('./names.mjs');
  const h = readHistory(sport);
  const byEspn = new Map();
  for (const e of h.events.values()) if (e.id) byEspn.set(String(e.id), e);
  const byOid = new Map();
  for (const l of h.lines) if (l.kind === 'c') (byOid.get(l.oid) ?? byOid.set(l.oid, { lines: [], props: [] }).get(l.oid)).lines.push(l);
  for (const p of h.props) if (p.kind === 'c') (byOid.get(p.oid) ?? byOid.set(p.oid, { lines: [], props: [] }).get(p.oid)).props.push(p);
  const propMarket = Object.fromEntries(Object.entries(API_MARKETS[sport] ?? {}).map(([api, key]) => [key, api]));
  const bookName = { pin: 'pinnacle', dk: 'draftkings' };
  const LINE_MARKET = { ml: 'h2h', spread: 'spreads', total: 'totals' };
  for (const b of mine) {
    const e = byEspn.get(String(b.event));
    const rows = e ? byOid.get(e.oid) : null;
    if (!rows) continue;
    const cands = [];
    if (b.market === 'prop') {
      const api = propMarket[b.propType];
      if (!api || !b.player) continue;
      const key = nameParts(b.player).key;
      for (const p of rows.props) {
        if (p.market !== api || p.line !== b.line || !fin(p.over) || !fin(p.under) || nameParts(p.player).key !== key) continue;
        const over = b.side === 'over';
        cands.push({ book: bookName[p.book] ?? p.book, line: p.line, odds: over ? p.over : p.under, fair: r4(over ? devig(p.over, p.under) : devig(p.under, p.over)) });
      }
    } else {
      const mk = LINE_MARKET[b.market];
      // (the archive's spread line is the home side's point; a and b the home and away prices, or over and under)
      const want = b.market === 'ml' ? null : b.market === 'spread' ? (b.side === 'home' ? b.line : -b.line) : b.line;
      const first = b.market === 'total' ? b.side === 'over' : b.side === 'home';
      for (const l of rows.lines) {
        if (l.market !== mk || !fin(l.a) || !fin(l.b) || (want !== null && l.line !== want)) continue;
        cands.push({ book: bookName[l.book] ?? l.book, line: b.market === 'ml' ? null : b.line, odds: first ? l.a : l.b, fair: r4(first ? devig(l.a, l.b) : devig(l.b, l.a)) });
      }
    }
    if (cands.length) out.set(b.id, cands);
  }
  return out;
}

// Every row's clv valued again under the current definition from the close it kept (and the archive's sharper one
// where given: closes, archiveCloses'); a moved line keeps the chance the older definition carried (its q) for the trust
// fit, never a judgement. Returns { valued, sharper (closes swapped for Pinnacle's), unchanged }
export function regradeLedger(bets, closes = new Map()) {
  let valued = 0;
  let sharper = 0;
  let unchanged = 0;
  for (const b of bets ?? []) {
    if (!b.clv && !b.close) continue;
    if (!b.close) {
      // (no close ever read: its reason kept, its version the current one)
      if (b.clv && b.clv.v !== CLV_V) b.clv = { ...b.clv, v: CLV_V };
      else unchanged++;
      continue;
    }
    const own = { ...b.close, book: b.close.book ?? (b.close.source === 'close' ? 'draftkings' : null) };
    const pick = sharpClose([...(closes.get(b.id) ?? []), own]);
    let close = own;
    if (pick && pick.book === 'pinnacle' && own.book !== 'pinnacle') {
      close = { line: pick.line, odds: pick.odds ?? null, fair: pick.fair, source: 'archive close', book: 'pinnacle', ...(own.source === 'close' ? { draftkings: { line: own.line, odds: own.odds, fair: r4(own.fair) } } : {}) };
      sharper++;
    }
    const was = b.clv;
    // (a moved line: the chance the older definition carried to the bet's line stands for the trust fit)
    const carry = was && fin(was.q) && fin(was.pts) && was.pts !== 0 ? () => was.q : null;
    const next = clvOf(b, close, null, null, carry);
    if (next) {
      b.close = close;
      b.clv = next;
      valued++;
    }
  }
  return { valued, sharper, unchanged };
}

// ---- standalone ----

async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const sports = argv.filter((a) => !a.startsWith('--'));
  const list = sports.length ? sports : TABLE_SPORTS;
  const regrade = flags.has('--regrade');
  const dry = flags.has('--dry');
  for (const sport of list) {
    const file = ledgerFile(sport);
    if (!existsSync(file)) {
      console.log(`${sport}: no ledger at ${file}`);
      continue;
    }
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const bets = betsOf(raw);
    if (regrade) {
      const before = JSON.stringify(clvTable(bets, sport));
      const closes = flags.has('--no-archive') ? new Map() : await archiveCloses(sport, bets);
      const r = regradeLedger(bets, closes);
      console.log(`${sport}: ${r.valued} rows valued again (clv.mjs v${CLV_V}), ${r.sharper} on Pinnacle's archived close, ${closes.size} rows with an archived close${dry ? ' (dry: not written)' : ''}`);
      if (!dry) {
        writeFileSync(file, JSON.stringify(raw));
      }
      if (before === JSON.stringify(clvTable(bets, sport))) console.log(`${sport}: the table unchanged`);
    }
    console.log(clvTableText(clvTable(bets, sport), { title: `\n### ${sport.toUpperCase()}: closing-line value (staked graded bets; CLV the close's no-vig chance less the chance our price implied)` }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
