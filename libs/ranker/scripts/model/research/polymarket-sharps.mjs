// The Polymarket sharps as a free market signal (DECISIONS.md D100; prereg d100-polymarket-sharps): research only.
// Reads what polymarket.mjs cached (never the network itself, except `jobs`, which writes the price-history jobs
// polymarket.mjs prices runs) and the desk's own archive (odds-history.mjs readHistory: DraftKings' and Pinnacle's
// opens and closes), and measures:
//
//   match      each league's Polymarket game events matched to the archive's games by the ET day and the teams'
//              nicknames (the outcome names against the archive's full team names), each market (moneyline, the
//              spread at a line, the total at a line) by the home/over frame; the match rates, both ways
//   wallets    the leaderboard's wallets scored on their trades: profit at price on the matched markets (a BUY of
//              outcome i at p pays 1 - p when i wins, -p otherwise; a SELL the reverse), settled sports trades (a
//              dated game slug a day or more before the moment), age (the first trade seen); 500+ settled trades
//              and a positive profit score a wallet (walk-forward: as of each moment from the trades settled before it)
//   beat       every scored wallet's trade on a matched market before the archive's close: its implied chance of its
//              side against the fair close (Pinnacle de-vigged at the same line, else DraftKings'), a beat where the
//              expected return at the fair is positive (D56's one definition); by sport and market, with a
//              game-clustered standard error against one half
//   signal     the scored wallets' net USDC flow on the home/over side by moment, per ESPN event, market and line:
//              .cache/polymarket/signal/<sport>.json, what polymarket.mjs polySignal reads at the bet's moment (the
//              trades before it only), and how many of the archive's in-window opens it reaches
//   jobs       the CLOB price-history jobs for step 4: the moneyline's home token and the total's Over token at the
//              archive's closing line, a window of 26 hours before the start
//   reference  step 4: Polymarket's price at the archive's close as a no-vig reference beside Pinnacle's: log loss on
//              the results (the Book's fair, Polymarket, the Bot's priced chance from the last gate score), and
//              whether the Bot's edge picks keep a positive expected return at Polymarket's price
//
// No look-ahead: a wallet's score at a moment uses only its trades on markets resolved before that moment (the game's
// start plus four hours); the flow at a moment uses only trades timestamped before it; the universe (today's
// leaderboard) is the one thing chosen with hindsight, and the write-up says so.
//
//   node libs/ranker/scripts/model/research/polymarket-sharps.mjs match|wallets|beat|signal|jobs|reference [nba nhl mlb nfl]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readHistory } from '../odds-history.mjs';
import { devig, sharpPair } from '../gate-history.mjs';
import { CACHE, LEAGUES, NET_MIN, flowBefore, priceAt, readEvents, readPrices, readTrades, tradesFile } from '../polymarket.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const fin = Number.isFinite;
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));
const r3 = (x) => (fin(x) ? Math.round(x * 1000) / 1000 : null);
const r4 = (x) => (fin(x) ? Math.round(x * 10000) / 10000 : null);
const pct = (x) => (fin(x) ? `${(x * 100).toFixed(1)}%` : '-');
const SEASONS = { nba: [2026, 2027], nhl: [2026, 2027], mlb: [2025, 2026], nfl: [2025, 2026] };
const MARKET = { h2h: 'ml', spreads: 'spread', totals: 'total' };
export const SETTLE_H = 4;
export const MIN_TRADES = 500;
const matchFile = (s) => path.join(CACHE, 'match', `${s}.json`);
const readJson = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const write = (f, v) => {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(v));
};

// ---- the archive's games with their opens, closes and fair closes ----

function archive(sport) {
  const h = readHistory(sport, { seasons: SEASONS[sport], props: false });
  const games = new Map();
  for (const e of h.events.values()) {
    if (!e.id || !e.t) continue;
    games.set(e.oid, { oid: e.oid, espn: String(e.id), t: Date.parse(e.t), day: etDay(Date.parse(e.t)), home: e.homeName, away: e.awayName, hs: e.hs, as: e.as, season: e.season, markets: {} });
  }
  for (const l of h.lines) {
    const g = games.get(l.oid);
    if (!g || !MARKET[l.market] || (l.kind !== 'o' && l.kind !== 'c')) continue;
    const key = `${MARKET[l.market]}|${l.line ?? ''}`;
    const m = (g.markets[key] ??= { market: MARKET[l.market], line: l.line ?? null });
    m[`${l.book}_${l.kind}`] = { ts: Date.parse(l.ts), a: l.a, b: l.b };
  }
  for (const g of games.values())
    for (const m of Object.values(g.markets)) {
      const c = m.dk_c;
      if (!c) continue;
      const pin = m.pin_c && Math.abs(m.pin_c.ts - c.ts) < 2 * 36e5 && sharpPair(m.pin_c) ? m.pin_c : null;
      m.closeTs = c.ts;
      m.fair = devig(pin ? pin.a : c.a, pin ? pin.b : c.b);
      m.fairBook = pin ? 'pin' : 'dk';
      if (m.dk_o) m.openTs = m.dk_o.ts;
    }
  return games;
}

// The game's result on a market's home/over side: 1 won, 0 lost, null a push or unplayed
function resultOf(g, market, line) {
  if (!fin(g.hs) || !fin(g.as)) return null;
  if (market === 'ml') return g.hs > g.as ? 1 : g.hs < g.as ? 0 : null;
  if (market === 'spread') {
    const d = g.hs - g.as + line;
    return d > 0 ? 1 : d < 0 ? 0 : null;
  }
  const d = g.hs + g.as - line;
  return d > 0 ? 1 : d < 0 ? 0 : null;
}

// ---- match ----

const nick = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const isTeam = (full, name) => {
  const f = nick(full);
  const n = nick(name);
  // (a nickname, or a city alone: Polymarket's "Utah" for the Utah Mammoth)
  return !!n && (f === n || f.endsWith(` ${n}`) || n.endsWith(` ${f}`) || f.startsWith(`${n} `));
};

export function matchLeague(sport, log = console.log) {
  const games = archive(sport);
  const byDay = new Map();
  for (const g of games.values()) {
    byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  }
  const pm = readEvents(sport);
  const out = [];
  let noTeams = 0;
  let noDay = 0;
  const unmatchedNames = new Map();
  for (const e of pm) {
    const ml = e.markets.find((m) => m.type === 'ml');
    const names = ml?.outcomes ?? e.title.split(/\s+vs\.?\s+/i);
    if (!names || names.length !== 2) continue;
    const day = e.start ? etDay(Date.parse(e.start)) : e.day;
    const cands = [day, e.day, ...[-1, 1].map((d) => etDay(Date.parse(`${day}T12:00:00Z`) + d * 864e5))].flatMap((d) => byDay.get(d) ?? []);
    // (the teams both ways round; a doubleheader's two games told apart by the nearest start)
    const fits = cands.filter((g) => (isTeam(g.home, names[0]) && isTeam(g.away, names[1])) || (isTeam(g.home, names[1]) && isTeam(g.away, names[0])));
    const found = fits.filter((g) => !g.pm).sort((x, y) => Math.abs(x.t - Date.parse(e.start ?? x.t)) - Math.abs(y.t - Date.parse(e.start ?? y.t)))[0] ?? null;
    if (!found) {
      if (!cands.length) noDay++;
      else {
        noTeams++;
        for (const n of names) if (!cands.some((g) => isTeam(g.home, n) || isTeam(g.away, n))) unmatchedNames.set(n, (unmatchedNames.get(n) ?? 0) + 1);
      }
      continue;
    }
    if (found.pm) continue;
    const homeIdx = isTeam(found.home, names[0]) ? 0 : 1;
    const markets = [];
    for (const m of e.markets) {
      if (m.type === 'ml') markets.push({ cid: m.cid, tokens: m.tokens, market: 'ml', line: null, homeIdx, resolved: m.resolved, prices: m.prices, volume: m.volume });
      else if (m.type === 'spread' && fin(m.line)) {
        // ("Spread: Raptors (-14.5)": the line is the named team's; the home frame negates an away team's)
        const named = m.outcomes.findIndex((o) => m.q.toLowerCase().includes(String(o).toLowerCase()));
        const namedIdx = named >= 0 ? named : 0;
        const homeLine = namedIdx === homeIdx ? m.line : -m.line;
        markets.push({ cid: m.cid, tokens: m.tokens, market: 'spread', line: homeLine, homeIdx, resolved: m.resolved, prices: m.prices, volume: m.volume });
      } else if (m.type === 'total' && fin(m.line)) markets.push({ cid: m.cid, tokens: m.tokens, market: 'total', line: m.line, homeIdx: m.outcomes.findIndex((o) => /^over$/i.test(o)), resolved: m.resolved, prices: m.prices, volume: m.volume });
    }
    found.pm = { id: e.id, slug: e.slug, start: e.start, markets };
    out.push(found);
  }
  const window = [...games.values()].filter((g) => pm.length && g.t >= Date.parse(pm[0].start ?? pm[0].day) && g.t <= Date.parse(pm.at(-1).start ?? pm.at(-1).day) && g.markets['ml|']?.dk_c);
  const report = { sport, polymarketGames: pm.length, archiveGamesInWindow: window.length, matched: out.length, archiveMatchedShare: r3(out.filter((g) => g.markets['ml|']?.dk_c).length / Math.max(1, window.length)), polymarketMatchedShare: r3(out.length / Math.max(1, pm.length)), noDay, noTeams, unmatchedNames: [...unmatchedNames].sort((a, b) => b[1] - a[1]).slice(0, 12) };
  log(JSON.stringify(report));
  write(matchFile(sport), { report, games: out });
  return { report, games: out };
}

export const readMatch = (sport) => readJson(matchFile(sport), { report: null, games: [] });

// ---- the trades on the matched markets ----

// Every cached wallet's trades on the matched markets of a sport: { wallet, t, market, line, espn, g, side (+1 the
// home/over side, -1 the other), c (the implied chance of the side taken), usd (the USDC notional on the side),
// shares, resolve (the market's settle moment), y (the side's result) }
function matchedTrades(sport, games) {
  const byCid = new Map();
  for (const g of games) for (const m of g.pm.markets) byCid.set(m.cid, { g, m });
  const rows = [];
  const dir = path.join(CACHE, 'trades');
  if (!existsSync(dir)) return rows;
  for (const f of readdirSync(dir)) {
    const w = readJson(path.join(dir, f), null);
    if (!w?.trades) continue;
    for (const x of w.trades) {
      const hit = byCid.get(x.cid);
      if (!hit || !fin(x.price) || !fin(x.size) || x.oi === null) continue;
      const { g, m } = hit;
      const onHome = x.oi === m.homeIdx;
      // (a BUY of a side is a position on it at its price; a SELL of a side a position on the other side at 1 - price)
      const buy = x.side === 'BUY';
      const side = (onHome ? 1 : -1) * (buy ? 1 : -1);
      const c = buy ? x.price : 1 - x.price;
      const y = resultOf(g, m.market, m.line);
      rows.push({ wallet: w.wallet, sport, t: x.t * 1000, market: m.market, line: m.line, espn: g.espn, g, side, c, usd: x.size * c, shares: x.size, resolve: g.t + SETTLE_H * 36e5, y: y === null ? null : side === 1 ? y : 1 - y });
    }
  }
  return rows.sort((a, b) => a.t - b.t);
}

// ---- wallets ----

// A wallet's sports trades settled by a moment: the trades whose event slug carries a game day a day or more before it
const slugDay = (slug) => {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(slug ?? '');
  return m ? Date.parse(`${m[1]}T00:00:00Z`) : null;
};

// Each wallet's walk-forward score: sorted settled-profit events (resolve time, profit) and settled-trade counts, so a
// query at a moment reads what was settled before it
export function walletScorer(allRows) {
  const byW = new Map();
  for (const r of allRows) {
    if (r.y === null) continue;
    const w = byW.get(r.wallet) ?? { profits: [], settled: [] };
    // (profit at price in USDC: the shares pay 1 each when the side wins)
    w.profits.push([r.resolve, r.shares * ((r.y === 1 ? 1 : 0) - r.c)]);
    byW.set(r.wallet, w);
  }
  const dir = path.join(CACHE, 'trades');
  const meta = new Map();
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    const w = readJson(path.join(dir, f), null);
    if (!w?.trades) continue;
    const e = byW.get(w.wallet) ?? { profits: [], settled: [] };
    for (const x of w.trades) {
      const d = slugDay(x.slug);
      if (d !== null) e.settled.push(d + 864e5);
    }
    e.settled.sort((a, b) => a - b);
    e.profits.sort((a, b) => a[0] - b[0]);
    byW.set(w.wallet, e);
    meta.set(w.wallet, { trades: w.trades.length, complete: w.complete, first: w.trades[0]?.t ? w.trades[0].t * 1000 : null, last: w.trades.at(-1)?.t ? w.trades.at(-1).t * 1000 : null });
  }
  const countBefore = (arr, t) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return {
    meta,
    wallets: [...byW.keys()],
    // ({ settled, profit, matched } as of t)
    at(wallet, t) {
      const e = byW.get(wallet);
      if (!e) return { settled: 0, profit: 0, matched: 0 };
      let profit = 0;
      let matched = 0;
      for (const [rt, p] of e.profits) {
        if (rt >= t) break;
        profit += p;
        matched++;
      }
      return { settled: countBefore(e.settled, t), profit, matched };
    },
    scored(wallet, t) {
      const s = this.at(wallet, t);
      return s.settled >= MIN_TRADES && s.profit > 0 && s.matched >= 20;
    },
  };
}

function walletsReport(sports, log = console.log) {
  const all = sports.flatMap((s) => matchedTrades(s, readMatch(s).games));
  const S = walletScorer(all);
  const lb = { all: readJson(path.join(CACHE, 'leaderboard-all.json'), { rows: [] }).rows, month: readJson(path.join(CACHE, 'leaderboard-month.json'), { rows: [] }).rows };
  const now = Date.now();
  const rows = [];
  for (const w of S.wallets) {
    const m = S.meta.get(w);
    if (!m) continue;
    const s = S.at(w, now);
    const mine = all.filter((r) => r.wallet === w);
    const lbRow = lb.all.find((r) => r.wallet === w) ?? lb.month.find((r) => r.wallet === w);
    rows.push({ wallet: w, name: lbRow?.name ?? null, lbPnl: lbRow?.pnl ?? null, lbVol: lbRow?.vol ?? null, trades: m.trades, complete: m.complete, since: m.first ? new Date(m.first).toISOString().slice(0, 10) : null, settled: s.settled, matchedTrades: mine.length, matchedUsd: Math.round(mine.reduce((a, r) => a + r.usd, 0)), profitAtPrice: Math.round(s.profit), scoredNow: S.scored(w, now) });
  }
  rows.sort((a, b) => b.profitAtPrice - a.profitAtPrice);
  const kept = rows.filter((r) => r.settled >= MIN_TRADES);
  const scored = rows.filter((r) => r.scoredNow);
  log(`wallets pulled ${rows.length}; with ${MIN_TRADES}+ settled sports trades ${kept.length}; scored today (500+, positive profit at price on 20+ matched trades) ${scored.length}; capped pulls ${rows.filter((r) => !r.complete).length}`);
  log(`matched trades ${all.length} (${sports.map((s) => `${s} ${all.filter((r) => r.g && matchedSport(r) === s).length}`).join(', ')})`);
  for (const r of rows.slice(0, 25)) log(`${r.wallet.slice(0, 10)} ${(r.name ?? '').padEnd(16).slice(0, 16)} lbPnl ${fmtUsd(r.lbPnl)} trades ${r.trades}${r.complete ? '' : '*'} settled ${r.settled} matched ${r.matchedTrades} ($${r.matchedUsd}) profit@price ${fmtUsd(r.profitAtPrice)} ${r.scoredNow ? 'SCORED' : ''}`);
  write(path.join(CACHE, 'wallets.json'), { at: new Date().toISOString(), rows });
  return rows;
}
const matchedSport = (r) => r.sport;
const fmtUsd = (x) => (fin(x) ? `$${Math.round(x).toLocaleString('en-US')}` : '-');

// ---- beat the fair close ----

// Mean and a game-clustered standard error of a 0/1 (or any) column
export function clustered(rows, valueOf, keyOf) {
  const by = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const e = by.get(k) ?? { s: 0, n: 0 };
    e.s += valueOf(r);
    e.n++;
    by.set(k, e);
  }
  const n = rows.length;
  if (!n) return { n: 0, mean: null, se: null, clusters: 0 };
  const mean = [...by.values()].reduce((a, e) => a + e.s, 0) / n;
  const k = by.size;
  const v = [...by.values()].reduce((a, e) => a + (e.s - mean * e.n) ** 2, 0);
  const se = k > 1 ? Math.sqrt(v * (k / (k - 1))) / n : null;
  return { n, mean, se, clusters: k };
}

function beatReport(sports, log = console.log) {
  const out = {};
  for (const sport of sports) {
    const games = readMatch(sport).games;
    const rows = matchedTrades(sport, games);
    const S = walletScorer(sports.flatMap((s) => matchedTrades(s, readMatch(s).games)));
    const beats = [];
    for (const r of rows) {
      const am = r.g.markets[`${r.market}|${r.line ?? ''}`];
      if (!am?.fair || !fin(am.closeTs) || r.t >= am.closeTs) continue;
      const q = r.side === 1 ? am.fair : 1 - am.fair;
      const ev = q / r.c - 1;
      beats.push({ ...r, q, ev, beat: ev > 0 ? 1 : 0, scored: S.scored(r.wallet, r.t), lead: (r.g.t - r.t) / 36e5 });
    }
    out[sport] = {};
    for (const scoredOnly of [false, true]) {
      for (const market of ['ml', 'spread', 'total', 'all']) {
        const sel = beats.filter((b) => (market === 'all' || b.market === market) && (!scoredOnly || b.scored));
        const c = clustered(sel, (b) => b.beat, (b) => b.espn);
        const e = clustered(sel, (b) => b.ev, (b) => b.espn);
        const wins = clustered(sel.filter((b) => b.y !== null), (b) => b.y, (b) => b.espn);
        const flat = clustered(sel.filter((b) => b.y !== null), (b) => (b.y === 1 ? 1 / b.c - 1 : -1), (b) => b.espn);
        const usd = sel.reduce((a, b) => a + b.usd, 0);
        const usdBeat = usd ? sel.reduce((a, b) => a + b.usd * b.beat, 0) / usd : null;
        const z = c.se ? (c.mean - 0.5) / c.se : null;
        const key = `${scoredOnly ? 'scored' : 'all'}:${market}`;
        out[sport][key] = { n: c.n, games: c.clusters, wallets: new Set(sel.map((b) => b.wallet)).size, beat: r4(c.mean), se: r4(c.se), z: r3(z), usdBeat: r4(usdBeat), ev: r4(e.mean), evSe: r4(e.se), win: r4(wins.mean), flat: r4(flat.mean), flatSe: r4(flat.se), usd: Math.round(usd) };
        if (c.n) log(`${sport} ${key.padEnd(14)} trades ${String(c.n).padStart(6)} games ${String(c.clusters).padStart(5)} wallets ${String(out[sport][key].wallets).padStart(3)} beat ${pct(c.mean)} ± ${pct(c.se)} (z ${r3(z)}) $-weighted ${pct(usdBeat)} ev ${pct(e.mean)} win ${pct(wins.mean)} flat ${pct(flat.mean)} ± ${pct(flat.se)} $${Math.round(usd).toLocaleString('en-US')}`);
      }
    }
    // (by lead: the signal needs trades before the open, 12 hours out for NBA/NHL/MLB)
    for (const [lo, hi] of [[12, 1e9], [3, 12], [1, 3], [0, 1]]) {
      const sel = beats.filter((b) => b.scored && b.lead >= lo && b.lead < hi);
      const c = clustered(sel, (b) => b.beat, (b) => b.espn);
      out[sport][`scored:lead:${lo}-${hi === 1e9 ? '' : hi}h`] = { n: c.n, games: c.clusters, beat: r4(c.mean), se: r4(c.se) };
      if (c.n) log(`${sport} scored lead ${lo}-${hi === 1e9 ? '' : hi}h: trades ${c.n} games ${c.clusters} beat ${pct(c.mean)} ± ${pct(c.se)}`);
    }
  }
  write(path.join(CACHE, 'beat.json'), { at: new Date().toISOString(), out });
  return out;
}

// ---- the signal file ----

function signalWrite(sports, log = console.log) {
  const all = sports.flatMap((s) => matchedTrades(s, readMatch(s).games));
  const S = walletScorer(all);
  for (const sport of sports) {
    const games = readMatch(sport).games;
    const rows = matchedTrades(sport, games);
    const sig = {};
    let used = 0;
    for (const r of rows) {
      if (!S.scored(r.wallet, r.t)) continue;
      const k = `${r.espn}|${r.market}|${r.line ?? ''}`;
      (sig[k] ??= []).push([r.t, Math.round(r.side * r.usd * 100) / 100]);
      used++;
    }
    for (const v of Object.values(sig)) v.sort((a, b) => a[0] - b[0]);
    write(path.join(CACHE, 'signal', `${sport}.json`), sig);
    // (coverage: the archive's in-window opens with a flow before their snapshot)
    let opens = 0;
    let withFlow = 0;
    let hard = 0;
    for (const g of games)
      for (const m of Object.values(g.markets)) {
        if (!fin(m.openTs) || (g.t - m.openTs) / 36e5 > 26) continue;
        opens++;
        const net = (sig[`${g.espn}|${m.market}|${m.line ?? ''}`] ?? []).filter(([t]) => t < m.openTs).reduce((a, [, u]) => a + u, 0);
        const has = (sig[`${g.espn}|${m.market}|${m.line ?? ''}`] ?? []).some(([t]) => t < m.openTs);
        if (has) withFlow++;
        if (Math.abs(net) >= NET_MIN) hard++;
      }
    log(`${sport}: ${used} scored trades on ${Object.keys(sig).length} markets; in-window opens ${opens}, with a flow before the open ${withFlow} (${pct(withFlow / Math.max(1, opens))}), a hard move (|net| >= $${NET_MIN}) ${hard} (${pct(hard / Math.max(1, opens))})`);
  }
}

// ---- step 4: jobs and the reference ----

function jobsWrite(sports, log = console.log) {
  for (const sport of sports) {
    const games = readMatch(sport).games;
    const jobs = [];
    for (const g of games) {
      const ml = g.pm.markets.find((m) => m.market === 'ml');
      const close = g.markets['ml|'];
      if (ml && close?.closeTs) jobs.push({ token: ml.tokens[ml.homeIdx], start: Math.floor(g.t / 1000) - 26 * 3600, end: Math.floor(g.t / 1000) + 600, espn: g.espn, market: 'ml' });
      const tot = Object.values(g.markets).find((m) => m.market === 'total' && m.dk_c);
      const pt = tot ? g.pm.markets.find((m) => m.market === 'total' && m.line === tot.line) : null;
      if (pt && pt.homeIdx >= 0) jobs.push({ token: pt.tokens[pt.homeIdx], start: Math.floor(g.t / 1000) - 26 * 3600, end: Math.floor(g.t / 1000) + 600, espn: g.espn, market: 'total', line: tot.line });
    }
    write(path.join(CACHE, `jobs-${sport}.json`), jobs);
    log(`${sport}: ${jobs.length} price-history jobs (${jobs.filter((j) => j.market === 'ml').length} moneylines, ${jobs.filter((j) => j.market === 'total').length} totals at the closing line)`);
  }
}

const logLoss = (p, y) => -(y ? Math.log(Math.min(0.999, Math.max(0.001, p))) : Math.log(Math.min(0.999, Math.max(0.001, 1 - p))));
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);

function referenceReport(sports, log = console.log) {
  const out = {};
  for (const sport of sports) {
    const games = readMatch(sport).games;
    const jobs = readJson(path.join(CACHE, `jobs-${sport}.json`), []);
    const scoreFile = (readdirSync(path.join(ROOT, '.cache/gate/scores')).filter((f) => f.endsWith(`-wt-${sport}.json`)).map((f) => path.join(ROOT, '.cache/gate/scores', f)).sort((a, b) => a.localeCompare(b)).at(-1)) ?? null;
    const score = scoreFile ? readJson(scoreFile, null) : null;
    const botOpen = new Map((score?.bet?.history?.replay ?? []).filter((x) => x.id?.endsWith(':o') && x.stat !== 'prop').map((x) => [`${x.event}|${x.stat}|${x.line ?? ''}`, x]));
    const rows = [];
    for (const j of jobs) {
      const g = games.find((x) => x.espn === j.espn);
      const am = g?.markets[`${j.market}|${j.line ?? ''}`];
      const ph = readPrices(j.token);
      if (!g || !am?.fair || !ph) continue;
      const pm = priceAt(ph.history, Math.floor(am.closeTs / 1000));
      const pmOpen = fin(am.openTs) ? priceAt(ph.history, Math.floor(am.openTs / 1000)) : null;
      const y = resultOf(g, j.market, j.line ?? null);
      if (pm === null || y === null) continue;
      const bo = botOpen.get(`${g.espn}|${j.market}|${j.line ?? ''}`) ?? null;
      rows.push({ espn: g.espn, market: j.market, y, fair: am.fair, pm, pmOpen, odds: [am.dk_c.a, am.dk_c.b], openP: bo?.p ?? null, openF: bo?.f ?? null, openOdds: am.dk_o ? [am.dk_o.a, am.dk_o.b] : null });
    }
    out[sport] = {};
    for (const market of ['ml', 'total']) {
      const sel = rows.filter((r) => r.market === market);
      if (!sel.length) continue;
      const ll = (f) => clustered(sel.filter((r) => fin(f(r))), (r) => logLoss(f(r), r.y), (r) => r.espn);
      const gap = clustered(sel, (r) => Math.abs(r.pm - r.fair), (r) => r.espn);
      const diffPmFair = clustered(sel, (r) => logLoss(r.pm, r.y) - logLoss(r.fair, r.y), (r) => r.espn);
      // (the Bot's bets are the opens' positive-edge sides (D56: a side whose priced chance clears its DraftKings open
      // price); each judged three ways: a positive expected return at Pinnacle's fair close (beat the fair close), at
      // Polymarket's price at the archive's close, and at Polymarket's price at the open's own moment where it traded)
      const opens = [];
      const openRows = sel.filter((x) => fin(x.openP) && x.openOdds);
      for (const r of openRows) {
        for (const [side, p, o] of [[1, r.openP, r.openOdds[0]], [-1, 1 - r.openP, r.openOdds[1]]]) {
          if (!fin(o) || p <= 1 / dec(o)) continue;
          const q = side === 1 ? r.fair : 1 - r.fair;
          const pmC = side === 1 ? r.pm : 1 - r.pm;
          const pmO = fin(r.pmOpen) ? (side === 1 ? r.pmOpen : 1 - r.pmOpen) : null;
          opens.push({ espn: r.espn, evFair: q * dec(o) - 1, evPm: pmC * dec(o) - 1, evPmOpen: pmO === null ? null : pmO * dec(o) - 1, flat: (side === 1 ? r.y : 1 - r.y) === 1 ? dec(o) - 1 : -1 });
        }
      }
      const oFair = clustered(opens, (p) => (p.evFair > 0 ? 1 : 0), (p) => p.espn);
      const oPm = clustered(opens, (p) => (p.evPm > 0 ? 1 : 0), (p) => p.espn);
      const withO = opens.filter((p) => p.evPmOpen !== null);
      const oPmOpen = clustered(withO, (p) => (p.evPmOpen > 0 ? 1 : 0), (p) => p.espn);
      const evFair = clustered(opens, (p) => p.evFair, (p) => p.espn);
      const evPm = clustered(opens, (p) => p.evPm, (p) => p.espn);
      const flat = clustered(opens, (p) => p.flat, (p) => p.espn);
      // (at the open's moment: the Bot's priced chance, the Book's open fair and Polymarket's price, each on the results)
      const atOpen = sel.filter((x) => fin(x.openP) && fin(x.openF) && fin(x.pmOpen));
      const llO = (f) => clustered(atOpen, (r) => logLoss(f(r), r.y), (r) => r.espn);
      const dBotPmO = clustered(atOpen, (r) => logLoss(r.openP, r.y) - logLoss(r.pmOpen, r.y), (r) => r.espn);
      const dFPmO = clustered(atOpen, (r) => logLoss(r.openF, r.y) - logLoss(r.pmOpen, r.y), (r) => r.espn);
      out[sport][market] = { n: sel.length, games: new Set(sel.map((r) => r.espn)).size, llFair: r4(ll((r) => r.fair).mean), llPm: r4(ll((r) => r.pm).mean), pmLessFair: r4(diffPmFair.mean), pmLessFairSe: r4(diffPmFair.se), gap: r4(gap.mean), atOpen: atOpen.length, llBotOpen: r4(llO((r) => r.openP).mean), llBookOpen: r4(llO((r) => r.openF).mean), llPmOpen: r4(llO((r) => r.pmOpen).mean), botLessPmOpen: r4(dBotPmO.mean), botLessPmOpenSe: r4(dBotPmO.se), bookLessPmOpen: r4(dFPmO.mean), bookLessPmOpenSe: r4(dFPmO.se), picks: opens.length, beatFair: r4(oFair.mean), beatFairSe: r4(oFair.se), beatPm: r4(oPm.mean), beatPmSe: r4(oPm.se), beatPmOpen: r4(oPmOpen.mean), beatPmOpenN: withO.length, evFair: r4(evFair.mean), evPm: r4(evPm.mean), flat: r4(flat.mean), flatSe: r4(flat.se) };
      log(`${sport} ${market}: ${sel.length} closes; log loss at the close: Book fair ${r4(ll((r) => r.fair).mean)}, Polymarket ${r4(ll((r) => r.pm).mean)} (Polymarket − fair ${r4(diffPmFair.mean)} ± ${r4(diffPmFair.se)}; |pm − fair| ${r4(gap.mean)} a side). At the open's moment (${atOpen.length} rows): Bot ${r4(llO((r) => r.openP).mean)}, Book open ${r4(llO((r) => r.openF).mean)}, Polymarket ${r4(llO((r) => r.pmOpen).mean)} (Bot − Polymarket ${r4(dBotPmO.mean)} ± ${r4(dBotPmO.se)}; Book − Polymarket ${r4(dFPmO.mean)} ± ${r4(dFPmO.se)}). The Bot's open picks ${opens.length}: beat the fair close ${pct(oFair.mean)} ± ${pct(oFair.se)} (ev ${pct(evFair.mean)}), beat Polymarket's close ${pct(oPm.mean)} ± ${pct(oPm.se)} (ev ${pct(evPm.mean)}), positive at Polymarket's open-moment price ${pct(oPmOpen.mean)} of ${withO.length}; flat ${pct(flat.mean)} ± ${pct(flat.se)}`);
    }
  }
  write(path.join(CACHE, 'reference.json'), { at: new Date().toISOString(), out });
  return out;
}

// ---- cli ----

const args = process.argv.slice(2);
const cmd = args[0];
const sports = args.slice(1).filter((x) => LEAGUES.includes(x));
const want = sports.length ? sports : LEAGUES;
if (cmd === 'match') for (const s of want) matchLeague(s);
else if (cmd === 'wallets') walletsReport(want);
else if (cmd === 'beat') beatReport(want);
else if (cmd === 'signal') signalWrite(want);
else if (cmd === 'jobs') jobsWrite(want);
else if (cmd === 'reference') referenceReport(want);
else console.log('usage: polymarket-sharps.mjs match|wallets|beat|signal|jobs|reference [nba nhl mlb nfl]');
