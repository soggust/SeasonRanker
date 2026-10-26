// The residual model's training (residual.mjs; DECISIONS.md D31): the priced history (odds-history.mjs, every
// archived open and close) replayed the way the gate replays it (gate.mjs scoreVersion's history path, gate-history.mjs:
// the ratings and the saved fit's projections from the games before each game, the trust walk-forward by month as the
// current price), kept as frame rows, fit into monthly snapshots (residual.mjs fitWalk), judged walk-forward, and
// written to apps/<sport>/src/StaticData/model/residual.json behind the hold-out guard (guardOk: a refit worse than
// the shipped file on the shared held-out months, or worse than the Book on the newest, doesn't ship).
//
//   node libs/ranker/scripts/model/residual-train.mjs [nfl nhl nba mlb] [--collect] [--write] [--trees N] [--every N] [--force]
//
//   --collect   replay the history again (else the cached rows, .cache/model/residual/<sport>-rows.json.gz)
//   --write     write the model file where the guard allows (--force past the guard, for a first file or a known fix)
//   --trees N   a boosted-trees stage of N trees on the logistic margin (measured first; 0 ships unless it pays)
//   --every N   fit every N-th month's snapshot (the others carry the last: faster measuring)
//
// Needs the desk's cache (.cache/model: the saved fit, the context facts; a dry run fills it), as the gate does.
// Never places a bet, never spends a credit. The report (the owner's format: one table a sport, rows a market,
// Residual / Current priced / Book at the close, lower better) goes to stdout and .cache/model/residual/report.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { r4, seasonWeight } from './gate-score.mjs';
import { extendedGames, historyPropIndex, lineHistoryRows, loadHistory, propHistoryRows, propIndexByPlayer } from './gate-history.mjs';
import { readFit } from './fitcache.mjs';
import { MODEL_EPOCH, LEAGUES } from './leagues.mjs';
import * as ratings from './ratings.mjs';
import * as context from './context.mjs';
import * as margins from './margins.mjs';
import * as backtest from './backtest.mjs';
import * as desk from './desk.mjs';
import * as props from './props.mjs';
import * as project from './project.mjs';
import * as logs from './playerlogs.mjs';
import { MODEL_V, binLoss, fitWalk, guardOk, modelFile, monthKey, residualChance, topFeatures } from './residual.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const CACHE = path.join(ROOT, '.cache/model/residual');
// (the collector's "current price" (pcur: the trust's chance the blend sits on) is priced with the residual blend off
// in this process, whatever RESID_PRICING says: the blend's weight is fit against the price it sits on, never on top
// of itself (DECISIONS.md D32's loops; tests/model-decisions.test.mjs D32))
process.env.RESID_OFF = '1';
export const SPORTS = ['nfl', 'nhl', 'nba', 'mlb'];
const fin = Number.isFinite;
const readJson = (f, fb) => {
  try {
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fb;
  } catch {
    return fb;
  }
};
const rowsFile = (sport) => path.join(CACHE, `${sport}-rows.json.gz`);
function wantOf(state, OPTIONAL, sport) {
  const terms = state.context?.terms ?? [];
  const kept = new Set(terms.filter((t) => t.kept).map((t) => t.key));
  const known = new Set(terms.map((t) => t.key));
  return (source) => !terms.length || (OPTIONAL?.[sport]?.[source] ?? []).some((k) => kept.has(k) || !known.has(k));
}
// (the season's phase at a start: how far into its first 90 days it is, from the season's first start in the
// history. The first start is in the past by the time any later row is priced: no look-ahead)
export function phaseOf(starts) {
  const first = new Map();
  for (const [season, t] of starts) if (fin(season) && fin(t) && (!first.has(season) || t < first.get(season))) first.set(season, t);
  return (season, t) => (first.has(season) ? Math.min(1, Math.max(0, (t - first.get(season)) / (90 * 864e5))) : 0);
}

// ---- collecting the rows (the gate's history path) ----

// A sport's frame rows from the priced history: lines and props, opens and closes, each with the current price
// (pcur: the gate's walk-forward trust price) and what the features read. [{ id, event, sport, market, stat, line,
// f, raw, overOdds, underOdds, t, at, kind, fo, home, y, q, season, pcur, trust, w, phase }]
export async function collect(sport, { log = console.log } = {}) {
  const say = (s) => log(`${sport}: ${s}`);
  const V = { ratings, context, margins, backtest, desk, props, project };
  const cfg = LEAGUES[sport];
  const state = readJson(path.join(ROOT, 'apps', sport, 'src/StaticData/model/state.json'), {});
  const history = readJson(path.join(ROOT, 'apps', sport, 'scripts/model/games.json'), []).filter((g) => g.type === 2 || g.type === 3).sort((a, b) => a.date.localeCompare(b.date));
  const finals = history.filter((g) => g.final && g.hs !== null && g.as !== null);
  let current = -Infinity;
  for (const g of finals) if (fin(g.season) && g.season > current) current = g.season;
  const before = state.params ?? cfg.priors;
  const best = ratings.fit(history, { ...cfg.priors, sigma: before.sigma ?? cfg.priors.sigma, sigmaT: before.sigmaT ?? cfg.priors.sigmaT }, cfg.grid);
  const params = { ...(best?.params ?? before) };
  let facts = readJson(path.join(ROOT, '.cache/model', `context-${sport}.json`), null);
  let feats = null;
  let ctxFit = null;
  if (facts) {
    try {
      await context.gather(sport, cfg, history, [], facts, wantOf(state, context.OPTIONAL, sport), {});
      feats = context.featurize(sport, cfg, history, facts, new Map());
      ctxFit = ratings.fitContext(history, params, feats.feats, feats.terms);
      if (ctxFit) Object.assign(params, { sigma: Math.round(ctxFit.after.sigma * 1000) / 1000, sigmaT: Math.round(ctxFit.after.sigmaT * 1000) / 1000 });
    } catch (err) {
      say(`context left out (${String(err?.message ?? err).slice(0, 160)})`);
      ctxFit = null;
    }
  } else {
    facts = {};
    say('no context facts in the cache: the ratings alone');
  }
  const expAll = new Map();
  ratings.replay(history, params, 0, ctxFit?.ctx ?? null, (g, e) => expAll.set(g.id, e));
  let shape = null;
  try {
    const mg = margins.fitMargins(sport, history, expAll, params.sigma);
    shape = { ties: mg.ties, ot: mg.ot, w: mg.kept ? mg.w : null };
  } catch {
    shape = null;
  }
  const hist = loadHistory(sport);
  if (!hist.events.size) {
    say('no history committed');
    return [];
  }
  const histGames = extendedGames(history, hist.events);
  const expExt = new Map();
  if (histGames.length > history.length) ratings.replay(histGames, params, 0, ctxFit?.ctx ?? null, (g, e) => expExt.set(String(g.id), e));
  const expOf = (id) => expAll.get(id) ?? expAll.get(String(id)) ?? expExt.get(String(id)) ?? null;
  const phase = phaseOf(histGames.map((g) => [g.season, Date.parse(g.date)]));
  const wOf = (season) => seasonWeight(sport, season, current).w;
  const rows = [];
  const histLines = lineHistoryRows(V, sport, params, shape, expOf, histGames, hist, current);
  for (const x of [...histLines.open, ...histLines.close]) {
    rows.push({ id: x.id, event: x.event, sport, market: x.market, stat: x.market, line: x.line, f: x.f, raw: x.raw, overOdds: x.overOdds, underOdds: x.underOdds, t: x.t, at: fin(x.at) ? x.at : x.t - (x.kind === 'o' ? 24 * 36e5 : 30 * 6e4), kind: x.kind, fo: x.fo ?? null, home: null, y: x.y, q: x.q, season: x.season, pcur: x.p, trust: x.trust, w: wOf(x.season), phase: phase(x.season, x.t) });
  }
  say(`lines: ${histLines.close.length} closes, ${histLines.open.length} opens`);
  // (the props: the replay's player games under the saved fit, matched to the history's index, as the gate's)
  const saved = readFit(sport);
  let index = hist.props.length ? historyPropIndex(hist.events, hist.props, Object.fromEntries(Object.entries(props.API_MARKETS?.[sport] ?? {}))) : new Map();
  if (!saved.fit) say(`props not collected: ${saved.why} (run the desk once, --dry)`);
  else if (index.size) {
    const prows = await logs.playerRows(sport, cfg, history, facts);
    // (by player, the book's names matched to the games' players as the gate's: gate-history.mjs propIndexByPlayer)
    index = propIndexByPlayer(index, prows, history);
    const info = new Map([...(feats?.feats ?? new Map())].map(([id, f]) => [id, f.info]));
    const market = sport === 'nfl' ? await props.nflMarket(history) : sport === 'nba' ? logs.boxMarket('nba') : null;
    const listed = sport === 'nfl' ? await props.nflListed(history, facts, [...new Set(prows.map((x) => x.season))].sort()) : null;
    const totals = sport === 'nhl' ? logs.boxTotals('nhl') : null;
    const soft = { prev: Object.fromEntries((state.props?.types ?? []).map((t) => [t.key, t.params?.soft ?? null])), now: Date.now() };
    const expPts = new Map([...expAll].map(([id, e]) => [id, [e.homePts, e.awayPts]]));
    const stats = props.STATS[sport] ?? [];
    const reuse = Object.fromEntries(stats.map((st) => [st.key, saved.fit.fits[st.key] ?? null]));
    const t0 = Date.now();
    const fitted = props.fitProps(sport, prows, expPts, info, facts, market, totals, listed, soft, reuse);
    const matches = [];
    for (const st of stats) {
      const f = fitted[st.key];
      if (!f) continue;
      const mine = [...props.statRows(sport, st, prows, market, totals)].sort((a, b) => a.date.localeCompare(b.date));
      if (!mine.length) continue;
      const d0 = mine[0].date.slice(0, 10);
      const { out: list } = project.replayStat(st, mine, f.params, f.env, [d0, d0]);
      for (const x of list) {
        if (!x.row.name || !x.row.game || !index.has(`${st.key}|${x.row.pid}|${x.row.game}`)) continue;
        const mu = x.p.mu;
        const mix = project.exitMix(f.params, x.p);
        matches.push({ stat: st.key, name: x.row.name, game: String(x.row.game), pid: String(x.row.pid), v: x.v, home: x.row.home ?? null, over: (line) => project.lineChances(line, mu, f.params, mix).over });
      }
    }
    say(`props: ${matches.length} player games matched in ${Math.round((Date.now() - t0) / 1000)}s under the saved fit of ${saved.fit.at ?? saved.fit.day}`);
    const hp = propHistoryRows(V, sport, index, matches, current);
    for (const x of [...hp.open, ...hp.close]) {
      rows.push({ id: x.id, event: x.event, sport, market: 'prop', stat: x.stat, line: x.line, f: x.f, raw: x.raw, overOdds: x.overOdds, underOdds: x.underOdds, t: x.t, at: fin(x.at) ? x.at : x.t - (x.kind === 'o' ? 12 * 36e5 : 6e4), kind: x.kind, fo: x.fo ?? null, home: x.home ?? null, y: x.y, q: x.q, season: x.season, pcur: x.p, trust: x.trust, w: wOf(x.season), phase: phase(x.season, x.t) });
    }
    say(`props: ${hp.close.length} closes, ${hp.open.length} opens priced`);
  }
  return rows;
}

// ---- judging and reporting ----

// Every settled row priced walk-forward by the model: [{ ...row, pRes, pBlend, noEdge, conf, lean, shade }]
export function pricedRows(model, rows) {
  const out = [];
  for (const x of rows) {
    if (!(x.y === 0 || x.y === 1) || !fin(x.pcur)) continue;
    const r = residualChance(model, x, x.pcur);
    if (!r) continue;
    out.push({ ...x, pRes: r.pRes, pBlend: r.p, noEdge: r.noEdge, conf: r.conf, lean: r.lean, shade: r.shade });
  }
  return out;
}
const mean = (rs, f) => (rs.length ? rs.reduce((s, x) => s + f(x), 0) / rs.length : null);
const ll = (rs, f) => mean(rs, (x) => binLoss(f(x), x.y));
// (the held-out months' record the guard reads: month -> kind -> { n, resid, blend, cur, book })
export function oosOf(priced) {
  const out = {};
  for (const x of priced) {
    const m = monthKey(x.t);
    const kind = x.market === 'prop' ? 'props' : 'lines';
    const o = ((out[m] ??= {})[kind] ??= { n: 0, resid: 0, blend: 0, cur: 0, book: 0 });
    o.n++;
    o.resid += binLoss(x.pRes, x.y);
    o.blend += binLoss(x.pBlend, x.y);
    o.cur += binLoss(x.pcur, x.y);
    o.book += binLoss(x.f, x.y);
  }
  for (const m of Object.values(out)) for (const o of Object.values(m)) for (const k of ['resid', 'blend', 'cur', 'book']) o[k] = r4(o[k] / o.n);
  return out;
}
const verdictOf = (resid, cur, book) => {
  const beatsBook = resid < book - 0.0002;
  const beatsCur = resid < cur - 0.0002;
  const tieBook = Math.abs(resid - book) <= 0.0002;
  if (beatsBook && beatsCur) return 'beats the Book and the current price';
  if (tieBook && beatsCur) return 'ties the Book, beats the current price';
  if (tieBook) return 'ties the Book';
  if (beatsCur && !beatsBook) return 'beats the current price, the Book still ahead';
  return 'behind';
};
// The owner's table for a sport at the close (kind 'c') or the open: rows a market, Residual / Current / Book
export function reportTable(sport, priced, kind) {
  const rs = priced.filter((x) => x.kind === kind);
  const groups = [['all props', rs.filter((x) => x.market === 'prop')]];
  for (const st of [...new Set(rs.filter((x) => x.market === 'prop').map((x) => x.stat))].sort()) groups.push([st, rs.filter((x) => x.stat === st)]);
  groups.push(['all lines', rs.filter((x) => x.market !== 'prop')]);
  for (const mk of ['ml', 'spread', 'total']) groups.push([mk, rs.filter((x) => x.market === mk)]);
  const lines = [`| ${sport.toUpperCase()} at the ${kind === 'c' ? 'close' : 'open'} | rows | Residual (blend) | Current priced | Book | no edge | verdict |`, '|---|---|---|---|---|---|---|'];
  for (const [g, sub] of groups) {
    if (sub.length < 50) continue;
    const a = ll(sub, (x) => x.pBlend);
    const b = ll(sub, (x) => x.pcur);
    const c = ll(sub, (x) => x.f);
    const ne = sub.filter((x) => x.noEdge).length / sub.length;
    lines.push(`| ${g} | ${sub.length} | ${a.toFixed(4)} | ${b.toFixed(4)} | ${c.toFixed(4)} | ${Math.round(ne * 100)}% | ${verdictOf(a, b, c)} |`);
  }
  return lines.join('\n');
}
export function featureWords(model) {
  const last = model.snapshots[model.snapshots.length - 1];
  const words = [];
  for (const kind of ['props', 'lines']) {
    const top = topFeatures(last?.parts?.[kind], 6);
    if (top.length) words.push(`${kind}: ${top.map((f) => `${f.name} ${f.beta > 0 ? '+' : ''}${f.beta}`).join(', ')}; blend ${last.blend?.[kind]}`);
  }
  return words;
}

// ---- the files ----

export function fileOf(sport, model, priced, rows, guard, opts) {
  const last = model.snapshots[model.snapshots.length - 1];
  // (a kind the guard refused ships at the current price: the newest snapshot's blend on it held at 0, the one the
  // live desk reads; the replay's earlier snapshots keep their walk-forward weights)
  if (last && guard?.heldKinds?.length) {
    last.blend = { ...last.blend };
    for (const k of guard.heldKinds) last.blend[k] = 0;
    last.held = [...guard.heldKinds];
  }
  const share = (kind) => {
    const rs = priced.filter((x) => (kind === 'props') === (x.market === 'prop'));
    return rs.length ? r4(rs.filter((x) => x.noEdge).length / rs.length) : null;
  };
  return {
    v: MODEL_V,
    sport,
    at: new Date().toISOString(),
    epoch: MODEL_EPOCH,
    rows: rows.length,
    settled: rows.filter((x) => x.y === 0 || x.y === 1).length,
    trees: opts.trees ?? 0,
    noEdge: { props: share('props'), lines: share('lines') },
    features: { props: topFeatures(last?.parts?.props, 10), lines: topFeatures(last?.parts?.lines, 10) },
    blend: last?.blend ?? null,
    guard,
    oos: oosOf(priced),
    snapshots: model.snapshots,
  };
}

// ---- the CLI ----

async function main() {
  const args = process.argv.slice(2);
  const flag = (k) => args.includes(k);
  const val = (k, d) => {
    const i = args.indexOf(k);
    return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : d;
  };
  const sports = args.filter((a) => SPORTS.includes(a));
  const list = sports.length ? sports : SPORTS;
  const trees = val('--trees', 0);
  const every = val('--every', 1);
  mkdirSync(CACHE, { recursive: true });
  const report = [`# The residual model (${new Date().toISOString().slice(0, 10)})`, '', 'Log loss on the results, lower is better. Residual: the blend the desk would price at (the current price and the corrected chance). Current priced: the trust pricing. Book: its no-vig at the same moment. "No edge": the share of rows where the corrected chance clears neither of the Book\'s prices.', ''];
  for (const sport of list) {
    let rows = null;
    if (!flag('--collect') && existsSync(rowsFile(sport))) {
      rows = JSON.parse(gunzipSync(readFileSync(rowsFile(sport))).toString('utf8'));
      console.log(`${sport}: ${rows.length} cached rows (${rowsFile(sport)}; --collect to replay again)`);
    } else {
      rows = await collect(sport);
      writeFileSync(rowsFile(sport), gzipSync(JSON.stringify(rows)));
      console.log(`${sport}: ${rows.length} rows collected and cached`);
    }
    if (!rows.length) continue;
    const t0 = Date.now();
    const model = fitWalk(rows, { sport, every, trees, log: (s) => console.log(`${sport}: ${s}`) });
    console.log(`${sport}: ${model.snapshots.length} snapshots in ${Math.round((Date.now() - t0) / 1000)}s`);
    const priced = pricedRows(model, rows);
    const oos = oosOf(priced);
    const prev = readJson(modelFile(sport), null);
    const guard = guardOk(oos, prev?.oos ?? null);
    const words = featureWords(model);
    report.push(reportTable(sport, priced, 'c'), '', reportTable(sport, priced, 'o'), '', `Top terms: ${words.join(' | ')}`, '', `Guard: ${guard.ok ? 'ok' : 'REFUSED'} (${guard.why})`, '');
    console.log(reportTable(sport, priced, 'c'));
    console.log(reportTable(sport, priced, 'o'));
    console.log(`${sport}: top terms ${words.join(' | ')}`);
    console.log(`${sport}: guard ${guard.ok ? 'ok' : 'REFUSED'}: ${guard.why}`);
    if (flag('--write')) {
      if (guard.ok || flag('--force')) {
        const out = modelFile(sport);
        writeFileSync(out, `${JSON.stringify(fileOf(sport, model, priced, rows, flag('--force') ? { ...guard, heldKinds: [] } : guard, { trees }))}\n`);
        console.log(`${sport}: model written ${path.relative(ROOT, out)} (${(readFileSync(out).length / 1024).toFixed(0)} KB)${guard.heldKinds.length && !flag('--force') ? `; ${guard.heldKinds.join(', ')} held at the current price` : ''}${guard.ok ? '' : ' past the guard (--force)'}`);
      } else console.log(`${sport}: not written: the guard refused (${guard.why}); the shipped file stands`);
    }
  }
  writeFileSync(path.join(CACHE, 'report.md'), `${report.join('\n')}\n`);
  console.log(`report: ${path.relative(ROOT, path.join(CACHE, 'report.md'))}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((err) => (console.error(err), process.exit(1)));
