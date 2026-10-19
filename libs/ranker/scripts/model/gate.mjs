// The replay gate: champion against challenger (the owner's rule, 2026-10-18: every bettor change replays history
// against the current version and ships only if it scores better; DECISIONS.md). Two versions of the model are
// scored on the same history, the same data, by the same measures (gate-score.mjs), and the verdict is SHIP or HOLD
// with a table per sport.
//
//   versions  the champion (--champion, default origin/master) and the candidate (--candidate, default the working
//             tree): a git ref (its libs/ranker/scripts/model copied to .cache/gate/<sha>/model, where its own
//             paths still read this checkout's data: ROOT is four levels up either way), 'worktree' (the files as
//             they are), or 'env:NAME=value[,NAME=value]' (the working tree with those set: a flag). Each is scored
//             in its own process (its modules, its env), the data loaded by this checkout's loaders for both
//   layer a   the projections, price-free, over every season the history has: each final's margin and total (a
//             normal's log score at the version's own sigma, its CRPS reported), each player game's stat (the
//             version's own count distribution's log chance of what he did: project.mjs chanceLog; the props'
//             eligible rows, the ones books post) replayed game by game from the games before it. The props'
//             settings are the saved fit's (fitcache.mjs: the desk's last search) unless --refit searches them
//             again with the version's code (the NFL's search is about 27 minutes)
//   layer b   every row with a saved price: the ledgers' graded props (bets and tracked rows, since 2026-10-08) and
//             game lines, and the game-line backtest (backtest.json, Pinnacle's anchor). Each row priced again by the
//             version, walk-forward: the props' learned correction (correct.mjs) fit on the rows before the row's
//             slate day only (a version from before it, the trust's shrink by the line's size, desk.mjs fitBuckets,
//             fit the same way); the game lines at the trust fit on the backtest's closes. The model's raw chance is
//             the version's replayed projection at the row's line where the desk's cache has the players' games
//             ('replay'), else the chance the row was saved with ('saved': the same for both, so only the pricing
//             differs). Measured: log loss on the results and against the close's no-vig chance, each against the
//             book's; each slate's top picks (desk.mjs PRACTICE_N) by edge, their hit rate, CLV (clv.mjs v2: the
//             close's chance at the pick's own price, less 1) and units at the practice stake; the edge picks at the
//             desk's stake table
//   rule      gate-score.mjs gateVerdict: SHIP when every sport's layer a isn't worse beyond noise in its deciding
//             seasons and its layer b beats or ties on log loss, close log loss and the top picks' CLV
//   scorecard --record: the candidate's numbers on the frozen benchmark (gate-frozen.json, fixed 2026-10-18) and the
//             rolling set (the last ROLLING_DAYS of graded rows) appended to apps/<sport>/src/StaticData/model/
//             scorecard.json, keyed by MODEL_EPOCH and the commit (the Algorithm tab's Scorecard)
//
// Usage:
//   node libs/ranker/scripts/model/gate.mjs [--candidate <ref|worktree|env:K=V>] [--champion <ref>] [nfl nhl ...]
//        [--refit] [--record] [--json <file>]
//   node libs/ranker/scripts/model/gate.mjs --score-only <ref|worktree> --record   (one version's scorecard)
//   node libs/ranker/scripts/model/gate.mjs --freeze   (writes gate-frozen.json: done once, 2026-10-18)
// Free: no API calls, no AI; the data the desk's cache has (no cache: the players' games are fetched, slowly, and
// the props' layer waits on a saved fit). Never places a bet.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { BET_DECIDE, betCompare, betSummary, binLoss, dec, gateVerdict, normalCrps, normalLoss, projCompare, r4, seasonWeight, sportVerdict } from './gate-score.mjs';
import { historyLeakBets, huntLeaks } from './leaks.mjs';
import { extendedGames, historyPropIndex, lineHistoryRows, loadHistory, propHistoryRows, slim, vsBook, vsBookBySeason } from './gate-history.mjs';
import { MARKETS as MMA_MARKETS, scoreMma } from './gate-mma.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const MODEL = path.join(ROOT, 'libs/ranker/scripts/model');
const GATE = path.join(ROOT, '.cache/gate');
// (MMA since 2026-10-19: the fights league scored by gate-mma.mjs on the archive and its priced history)
export const SPORTS = ['nfl', 'nhl', 'nba', 'mlb', 'mma'];
export const ROLLING_DAYS = 28;
export const FROZEN_FILE = path.join(MODEL, 'gate-frozen.json');
const PROP_FROM = '2026-10-08T00:00:00Z';
const MARKETS = ['spread', 'total', 'ml'];
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));
const fin = Number.isFinite;
const readJson = (file, fallback) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const ledgerOf = (sport) => readJson(path.join(ROOT, 'apps', sport, 'src/StaticData/model/ledger.json'), { bets: [] });

// ---- the versions ----

// A version from its spec: { spec, label, dir (its model folder), sha, env }
export function resolveVersion(spec) {
  const s = String(spec ?? 'worktree');
  if (s === 'worktree' || s.startsWith('env:')) {
    const env = {};
    if (s.startsWith('env:'))
      for (const kv of s.slice(4).split(',')) {
        const i = kv.indexOf('=');
        if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
      }
    let sha = null;
    let dirty = false;
    try {
      sha = git(['rev-parse', 'HEAD']).trim();
      dirty = !!git(['status', '--porcelain', '--', 'libs/ranker/scripts/model']).trim();
    } catch {
      // (no git: unknown)
    }
    return { spec: s, label: s === 'worktree' ? `worktree${dirty ? ' (changed)' : ''}` : s, dir: MODEL, sha, dirty, env };
  }
  const sha = git(['rev-parse', `${s}^{commit}`]).trim();
  const dir = path.join(GATE, sha.slice(0, 12), 'model');
  if (!existsSync(path.join(dir, '.done'))) {
    mkdirSync(dir, { recursive: true });
    const files = git(['ls-tree', '--name-only', sha, 'libs/ranker/scripts/model/']).trim().split('\n').filter((f) => f.endsWith('.mjs') || f.endsWith('.json'));
    for (const f of files) writeFileSync(path.join(dir, path.basename(f)), execFileSync('git', ['show', `${sha}:${f}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }));
    writeFileSync(path.join(dir, '.done'), sha);
  }
  return { spec: s, label: `${s} (${sha.slice(0, 8)})`, dir, sha, dirty: false, env: {} };
}

// (a version's code by part, as hashes: what changed between two)
const PARTS = { props: ['project.mjs', 'props.mjs', 'matchups.mjs', 'playerlogs.mjs'], games: ['ratings.mjs', 'context.mjs', 'margins.mjs', 'football.mjs', 'hockey.mjs', 'baseball.mjs', 'teamstats.mjs', 'terms.mjs', 'officials.mjs', 'leagues.mjs'], pricing: ['correct.mjs', 'desk.mjs', 'calib.mjs', 'backtest.mjs', 'clv.mjs', 'anchor.mjs'], live: ['run.mjs', 'timing.mjs', 'lineup-risk.mjs', 'suggest.mjs', 'checks.mjs', 'check-learn.mjs', 'check-patterns.mjs', 'research.mjs', 'picks.mjs', 'board.mjs', 'news.mjs', 'notes.mjs', 'playchance.mjs', 'anytime.mjs', 'oddsapi.mjs', 'espn.mjs'], mma: ['fights-model.mjs', 'fights-totals.mjs', 'fights-venue.mjs', 'mma-desk.mjs'] };
export function codeOf(dir) {
  const out = {};
  for (const [part, files] of Object.entries(PARTS)) {
    const h = createHash('sha256');
    for (const f of files) if (existsSync(path.join(dir, f))) h.update(`|${f}|`).update(readFileSync(path.join(dir, f)));
    out[part] = h.digest('hex').slice(0, 12);
  }
  return out;
}

// ---- the priced rows (layer b), in the over's frame (gate-score.mjs) ----

const decided = (b) => b.status === 'won' || b.status === 'lost' || b.status === 'push';
const yOf = (b) => (b.status === 'won' ? 1 : b.status === 'lost' ? 0 : null);

// Every sport's ledger props with a result or a close (bets and tracked rows), since PROP_FROM
export function pricedProps(ledgers) {
  const out = [];
  for (const [sport, l] of Object.entries(ledgers))
    for (const b of l?.bets ?? []) {
      if (!b || b.market !== 'prop' || b.void || !b.propType || (b.side !== 'over' && b.side !== 'under')) continue;
      if (Date.parse(b.start) < Date.parse(PROP_FROM)) continue;
      const m = fin(b.modelRaw) ? b.modelRaw : b.model;
      if (!fin(m) || !fin(b.fair) || !fin(b.line)) continue;
      if (!decided(b) && !fin(b.clv?.q)) continue;
      out.push({ ...b, sport: b.sport ?? sport });
    }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || String(a.id).localeCompare(String(b.id)));
}

// A prop's row in the over's frame at the version's over chance pOver
export function propRow(b, pOver, stake = null) {
  const o = b.side === 'over';
  const y = yOf(b);
  const q = fin(b.clv?.q) ? b.clv.q : null;
  return {
    id: String(b.id),
    event: String(b.event ?? b.id),
    sport: b.sport,
    stat: b.propType,
    line: b.line,
    day: etDay(Date.parse(b.start)),
    t: Date.parse(b.start),
    f: o ? b.fair : 1 - b.fair,
    p: pOver,
    y: y === null ? null : o ? y : 1 - y,
    q: q === null ? null : o ? q : 1 - q,
    overOdds: o ? b.odds : b.otherOdds,
    underOdds: o ? b.otherOdds : b.odds,
    units: fin(b.units) ? b.units : 0,
    intent: b.intent ?? null,
    ...(stake ? { stake } : {}),
  };
}

// A game line's row: its own side the 'over' (a line's other side has no saved price: never picked)
export function lineRow(b, p, stake = null) {
  return { id: String(b.id) + (b.when ? `:${b.when}` : ''), event: String(b.event ?? b.id), sport: b.sport, stat: b.market, line: b.line ?? null, day: etDay(Date.parse(b.start)), t: Date.parse(b.start), f: b.fair, p, y: yOf(b), q: fin(b.clv?.q) ? b.clv.q : null, overOdds: b.odds, underOdds: null, units: fin(b.units) ? b.units : 0, intent: b.intent ?? null, ...(stake ? { stake } : {}) };
}

// ---- scoring one version (the child process) ----

async function load(dir, name) {
  const file = path.join(dir, `${name}.mjs`);
  if (!existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}

// (the optional sources a run would ask for: the ones feeding a kept term or one never tried (run.mjs wantSource))
function wantOf(state, OPTIONAL, sport) {
  const terms = state.context?.terms ?? [];
  const kept = new Set(terms.filter((t) => t.kept).map((t) => t.key));
  const known = new Set(terms.map((t) => t.key));
  return (source) => !terms.length || (OPTIONAL?.[sport]?.[source] ?? []).some((k) => kept.has(k) || !known.has(k));
}

// The props' pricer of a version, walk-forward by slate day: pOver for each of this sport's rows, from the rows of
// every sport before its day. With the learned correction (correct.mjs) its tuned fit; before it (or under its
// minimum rows) the trust's shrink by the line's size (desk.mjs fitBuckets, bucketTrustOf, chanceAt)
export function pricePropsWalk(V, sport, all, mOf, { log = () => {} } = {}) {
  const mine = all.filter((b) => b.sport === sport);
  const withM = all.map((b) => {
    const m = mOf(b);
    return fin(m) ? { ...b, modelRaw: m, model: m } : null;
  }).filter(Boolean);
  const byId = new Map(withM.map((b) => [String(b.id), b]));
  const days = [...new Set(mine.map((b) => etDay(Date.parse(b.start))))].sort();
  const out = new Map();
  const rowsAll = V.correct ? V.correct.corrRows(withM) : null;
  const keyOf = (b) => `prop:${b.propType}`;
  let corrDays = 0;
  for (const d of days) {
    const before = (t) => etDay(t) < d;
    const today = mine.filter((b) => etDay(Date.parse(b.start)) === d && byId.has(String(b.id))).map((b) => byId.get(String(b.id)));
    if (!today.length) continue;
    let fit = null;
    if (rowsAll) {
      const t = V.correct.tuneCorrection(rowsAll.filter((x) => before(x.t)), sport);
      fit = t.fit ?? null;
    }
    let trustAt = null;
    if (!fit) {
      const prior = withM.filter((b) => before(Date.parse(b.start)));
      const minePrior = prior.filter((b) => b.sport === sport);
      const keys = [...new Set(today.map(keyOf))];
      const ladder = V.desk.fitBuckets ? V.desk.fitBuckets(prior, minePrior, keyOf, keys) : null;
      const trust = Object.fromEntries(keys.map((k) => [k, { trust: V.desk.fitTrust(minePrior.filter((b) => keyOf(b) === k), 0.5).trust, ...(ladder ? { lines: ladder.keys[k] } : {}) }]));
      trustAt = (b) => (V.desk.bucketTrustOf ? V.desk.bucketTrustOf(trust, keyOf(b), b.line) : trust[keyOf(b)].trust);
    } else corrDays++;
    for (const b of today) {
      let pOver;
      if (fit) {
        const x = V.correct.frameOf({ sport: b.sport, stat: b.propType, line: b.line, side: b.side, model: b.modelRaw, fair: b.fair, odds: b.odds, otherOdds: b.otherOdds, home: b.home, hours: (Date.parse(b.start) - Date.parse(b.placedAt ?? b.start)) / 36e5 });
        pOver = V.correct.correctedOver(fit, x);
      } else {
        // (the row as the residual model's ctx (residual.mjs; a version with desk.mjs chanceAt's hook reads it, an
        // older chanceAt ignores it): the side's frame, the bet's moment)
        const ctx = { sport: b.sport, market: 'prop', stat: b.propType, line: b.line, side: b.side, f: b.fair, raw: b.modelRaw, overOdds: b.side === 'over' ? b.odds : b.otherOdds, underOdds: b.side === 'over' ? b.otherOdds : b.odds, t: Date.parse(b.start), at: Date.parse(b.placedAt ?? b.start), home: b.home ?? null, hours: (Date.parse(b.start) - Date.parse(b.placedAt ?? b.start)) / 36e5 };
        const ps = V.desk.chanceAt('prop', b.fair, b.modelRaw, trustAt(b), ctx);
        pOver = b.side === 'over' ? ps : 1 - ps;
      }
      if (fin(pOver)) out.set(String(b.id), Math.min(0.999, Math.max(0.001, pOver)));
    }
  }
  log(`props priced on ${days.length} slate days (${corrDays} by the learned correction, ${days.length - corrDays} by the trust's shrink)`);
  return out;
}

// The stakes a version's desk would put on each side of a row at its chance (desk.mjs stakeFor at the state's EV
// scale): { over, under }
function stakesOf(V, x, evScale) {
  const out = {};
  for (const side of ['over', 'under']) {
    const odds = side === 'over' ? x.overOdds : x.underOdds;
    if (!fin(odds) || !odds) {
      out[side] = 0;
      continue;
    }
    const p = side === 'over' ? x.p : 1 - x.p;
    const ev = p * dec(odds) - 1;
    out[side] = ev > 0 ? V.desk.stakeFor(ev, evScale, odds) : 0;
  }
  return out;
}

// One version's scores for a sport: { sport, notes, current, proj: { games, props }, bet: { props: { saved, replay },
// lines: { saved, replay } }, meta }
export async function scoreVersion(dir, sport, { refit = false, propsLayer = true, log = console.log } = {}) {
  // (the fights league: its own scoring, gate-mma.mjs, on the archive's bouts and the MMA priced history)
  if (sport === 'mma') return { ...(await scoreMma(dir, { log })), code: codeOf(dir) };
  const notes = [];
  const say = (s) => (notes.push(s), log(`${sport}: ${s}`));
  const V = {};
  // (anchor: the anchored projection (anchor.mjs, D33); a version from before it has none, its own chances priced)
  // (lineupRisk: the lineup risk's fit on the history's opens against their closes (lineup-risk.mjs, D42); none before it)
  for (const n of ['leagues', 'ratings', 'context', 'margins', 'backtest', 'desk', 'props', 'project', 'correct', 'anchor', 'lineup-risk']) V[n === 'lineup-risk' ? 'lineupRisk' : n] = await load(dir, n);
  // (the loaders: this checkout's, so both versions read the same history)
  const H = { context: await import('./context.mjs'), logs: await import('./playerlogs.mjs'), props: await import('./props.mjs'), fitcache: await import('./fitcache.mjs'), espn: await import('./espn.mjs') };
  const cfg = V.leagues.LEAGUES[sport];
  const state = readJson(path.join(ROOT, 'apps', sport, 'src/StaticData/model/state.json'), {});
  const history = readJson(path.join(ROOT, 'apps', sport, 'scripts/model/games.json'), []).filter((g) => g.type === 2 || g.type === 3).sort((a, b) => a.date.localeCompare(b.date));
  const finals = history.filter((g) => g.final && g.hs !== null && g.as !== null);
  const current = Math.max(...finals.map((g) => g.season).filter(fin));
  // (the ratings, the context, the margins' shape: as run.mjs fitRatings, fitTheContext and fitTheMargins)
  const before = state.params ?? cfg.priors;
  const best = V.ratings.fit(history, { ...cfg.priors, sigma: before.sigma ?? cfg.priors.sigma, sigmaT: before.sigmaT ?? cfg.priors.sigmaT }, cfg.grid);
  const params = { ...(best?.params ?? before) };
  let facts = readJson(path.join(ROOT, '.cache/model', `context-${sport}.json`), null);
  let feats = null;
  let ctxFit = null;
  if (facts) {
    try {
      await H.context.gather(sport, cfg, history, [], facts, wantOf(state, H.context.OPTIONAL, sport), {});
      feats = V.context.featurize(sport, cfg, history, facts, new Map());
      ctxFit = V.ratings.fitContext(history, params, feats.feats, feats.terms);
      if (ctxFit) Object.assign(params, { sigma: Math.round(ctxFit.after.sigma * 1000) / 1000, sigmaT: Math.round(ctxFit.after.sigmaT * 1000) / 1000 });
    } catch (err) {
      say(`context left out (${String(err?.message ?? err).slice(0, 160)}): the ratings alone`);
      ctxFit = null;
    }
  } else {
    facts = {};
    say('no context facts in the cache (.cache/model): the ratings alone');
  }
  const expAll = new Map();
  V.ratings.replay(history, params, 0, ctxFit?.ctx ?? null, (g, e) => expAll.set(g.id, e));
  let shape = null;
  try {
    const mg = V.margins.fitMargins(sport, history, expAll, params.sigma);
    shape = { ties: mg.ties, ot: mg.ot, w: mg.kept ? mg.w : null };
  } catch {
    shape = null;
  }
  // (layer a, games: every final after the first season (with two seasons or fewer, after the first 30% of the
  // finals: the ratings' start), its margin's and total's log score and CRPS)
  const seasons = [...new Set(finals.map((g) => g.season))].sort();
  const skipTo = seasons.length > 2 ? null : finals[Math.floor(finals.length * 0.3)]?.date;
  const games = [];
  for (const g of finals) {
    if (seasons.length > 2 && g.season === seasons[0]) continue;
    if (skipTo && g.date < skipTo) continue;
    const e = expAll.get(g.id);
    if (!e) continue;
    const m = g.hs - g.as;
    const t = g.hs + g.as;
    games.push([String(g.id), etDay(Date.parse(g.date)), g.season, r4(normalLoss(m, e.margin, params.sigma)), r4(normalLoss(t, e.total, params.sigmaT)), r4(normalCrps(m, e.margin, params.sigma)), r4(normalCrps(t, e.total, params.sigmaT))]);
  }
  say(`games: ${games.length} finals scored (seasons ${seasons.join(', ')}; sigma ${params.sigma}, ${params.sigmaT}${ctxFit ? ', with the context' : ', no context'})`);

  // (layer b, game lines: the backtest's Pinnacle-anchored bets and the ledger's graded lines, each priced by the
  // version's margins at its line (backtest.mjs repriced), at the trust fit on the backtest's closes)
  const bt = readJson(path.join(ROOT, 'apps', sport, 'scripts/model/backtest.json'), { bets: [] }).bets ?? [];
  const btRep = V.backtest.repriced(bt.filter((b) => b.anchor === 'pinnacle'), expAll, params, shape).map((b) => ({ ...b, sport }));
  // (the totals' trust (D44, a version with trustStart): from 0, on the ledger's own graded totals alone, never the
  // backtest's closes, as the live desk fits it; the rest on the backtest's closes from 0.5 as before)
  const ledgerTotals = (ledgerOf(sport).bets ?? []).filter((b) => b.market === 'total' && !b.void && (decided(b) || fin(b.clv?.q)) && fin(b.fair) && fin(b.model) && Date.parse(b.placedAt ?? b.start) >= Date.parse(V.leagues.MODEL_EPOCH ?? PROP_FROM));
  const trust = Object.fromEntries(MARKETS.map((m) => [m, m === 'total' && V.desk.trustStart ? V.desk.fitTrust(ledgerTotals, V.desk.trustStart('total')).trust : V.desk.fitTrust(V.backtest.trustBets(btRep.filter((b) => b.market === m)), 0.5).trust]));
  const evScale = fin(state.evScale) ? state.evScale : 0.08;
  const ledgerLines = (ledgerOf(sport).bets ?? []).filter((b) => MARKETS.includes(b.market) && !b.void && (decided(b) || fin(b.clv?.q)) && fin(b.fair) && Date.parse(b.start) >= Date.parse(PROP_FROM)).map((b) => ({ ...b, sport }));
  const linesAt = (list, expOf) =>
    V.backtest
      .repriced(list, expOf, params, shape)
      .map((b) => {
        const p = V.desk.chanceAt(b.market, b.fair, b.model, trust[b.market] ?? 0.5, fin(b.named) ? { named: b.named } : null);
        const x = lineRow({ ...b, when: b.when ?? null }, p);
        return { ...x, stake: stakesOf(V, x, evScale), src: b.when ? 'backtest' : 'ledger' };
      })
      .filter((x) => fin(x.p));
  const linesReplay = [...linesAt(btRep, expAll), ...linesAt(ledgerLines, (b) => expAll.get(b.event) ?? null)];
  const linesSaved = [...linesAt(btRep, expAll), ...linesAt(ledgerLines, (b) => (fin(b.expMargin) && fin(b.expTotal) ? { margin: b.expMargin, total: b.expTotal } : null))];
  say(`game lines: ${btRep.length} backtest bets and ${ledgerLines.length} ledger rows priced (trust ${MARKETS.map((m) => `${m} ${trust[m]}`).join(', ')})`);

  // (layer b, the priced history (gate-history.mjs, odds-history.mjs): every archived open and close since 2020,
  // the games games.json doesn't keep replayed by the ratings from the history's own ESPN games (their context
  // none), games.json's at the desk's own expectation)
  const hist = loadHistory(sport);
  let histLines = { open: [], close: [] };
  let histGames = history;
  if (hist.events.size) {
    histGames = extendedGames(history, hist.events);
    const expExt = new Map();
    if (histGames.length > history.length) V.ratings.replay(histGames, params, 0, ctxFit?.ctx ?? null, (g, e) => expExt.set(String(g.id), e));
    const expOf = (id) => expAll.get(id) ?? expAll.get(String(id)) ?? expExt.get(String(id)) ?? null;
    histLines = lineHistoryRows(V, sport, params, shape, expOf, histGames, hist, current);
    say(`history lines: ${histLines.close.length} closes and ${histLines.open.length} opens priced (${new Set(histLines.close.map((x) => x.season)).size} seasons; ${histGames.length - history.length} games past games.json's replayed from the history's)`);
  } else say('history: none committed (odds-history.mjs)');

  // (layer a and the replay's chances, props: the players' games replayed under the saved fit's settings)
  const ledgers = Object.fromEntries(SPORTS.map((s) => [s, ledgerOf(s)]));
  const priced = pricedProps(ledgers);
  const mineProps = priced.filter((b) => b.sport === sport);
  let propsProj = null;
  const replayM = new Map();
  const ledgerMatches = new Map();
  // (the history's props by player game, and the replay's games matched to them)
  const histIndex = hist.props.length ? historyPropIndex(hist.events, hist.props, Object.fromEntries(Object.entries(H.props.API_MARKETS?.[sport] ?? {}))) : new Map();
  const histMatches = [];
  if (propsLayer && mineProps.length + finals.length > 0) {
    try {
      const saved = H.fitcache.readFit(sport);
      if (!saved.fit && !refit) say(`props' projections not scored: ${saved.why} (run the desk once, or --refit)`);
      else {
        const rows = await H.logs.playerRows(sport, cfg, history, facts);
        const info = new Map([...(feats?.feats ?? new Map())].map(([id, f]) => [id, f.info]));
        const market = sport === 'nfl' ? await H.props.nflMarket(history) : sport === 'nba' ? H.logs.boxMarket('nba') : null;
        const listed = sport === 'nfl' ? await H.props.nflListed(history, facts, [...new Set(rows.map((x) => x.season))].sort()) : null;
        const totals = sport === 'nhl' ? H.logs.boxTotals('nhl') : null;
        const soft = { prev: Object.fromEntries((state.props?.types ?? []).map((t) => [t.key, t.params?.soft ?? null])), now: Date.now() };
        const expPts = new Map([...expAll].map(([id, e]) => [id, [e.homePts, e.awayPts]]));
        const stats = V.props.STATS[sport] ?? [];
        const reuse = refit ? null : Object.fromEntries(stats.map((st) => [st.key, saved.fit.fits[st.key] ?? null]));
        const t0 = Date.now();
        const fitted = V.props.fitProps(sport, rows, expPts, info, facts, market, totals, listed, soft, reuse);
        // (the ledger's props of this sport by stat, player and game, and by stat, player and day)
        const want = new Map();
        // (an MLB player's rows are keyed by his StatsAPI id, mlb:<id>, the ledger's mlbId)
        for (const b of mineProps) {
          const who = sport === 'mlb' && b.mlbId ? `mlb:${b.mlbId}` : b.athlete;
          want.set(`${b.propType}|${who}|${b.event}`, b);
          want.set(`${b.propType}|${who}|${etDay(Date.parse(b.start))}`, b);
        }
        // (kept: a stat's eligible rows, the ones books post props for, where it has 200 or more; else all of them, as
        // the fit scores its own check: project.mjs scored)
        const out = { stat: [], pid: [], game: [], day: [], season: [], loss: [] };
        let eligible = 0;
        stats.forEach((st, si) => {
          const f = fitted[st.key];
          if (!f) return;
          const mine = [...V.props.statRows(sport, st, rows, market, totals)].sort((a, b) => a.date.localeCompare(b.date));
          if (!mine.length) return;
          const d0 = mine[0].date.slice(0, 10);
          const { out: list } = V.project.replayStat(st, mine, f.params, f.env, [d0, d0]);
          const elig = list.filter((x) => x.row.eligible !== false).length >= 200;
          for (const x of list) {
            const mix = V.project.exitMix(f.params, x.p);
            if (histIndex.size && x.row.name && x.row.game && histIndex.has(`${st.key}|${H.espn.nameKey(x.row.name)}|${x.row.game}`)) {
              const mu = x.p.mu;
              histMatches.push({ stat: st.key, name: x.row.name, game: String(x.row.game), pid: String(x.row.pid), v: x.v, home: x.row.home ?? null, mu, params: f.params, mix, over: (line) => V.project.lineChances(line, mu, f.params, mix).over });
            }
            const ll = -V.project.chanceLog(x.v, x.p.mu, f.params, mix);
            if (fin(ll) && (!elig || x.row.eligible !== false)) {
              out.stat.push(si);
              out.pid.push(String(x.row.pid));
              out.game.push(Number(x.row.game) || 0);
              out.day.push(x.row.date.slice(0, 10));
              out.season.push(x.row.season);
              out.loss.push(Math.round(ll * 1e5) / 1e5);
              if (x.row.eligible !== false) eligible++;
            }
            const b = want.get(`${st.key}|${x.row.pid}|${x.row.game}`) ?? want.get(`${st.key}|${x.row.pid}|${etDay(Date.parse(x.row.date))}`) ?? want.get(`${st.key}|${x.row.pid}|${x.row.date.slice(0, 10)}`);
            // (the ledger's row's replayed chance: priced below, once the history's anchor is fit (D33))
            if (b && !ledgerMatches.has(String(b.id))) ledgerMatches.set(String(b.id), { b, mu: x.p.mu, params: f.params, mix });
          }
        });
        propsProj = { stats: stats.map((s) => s.key), ...out };
        say(`props: ${out.loss.length} player games projected (${eligible} eligible) in ${Math.round((Date.now() - t0) / 1000)}s under ${refit ? 'a fresh search' : `the saved fit of ${saved.fit.at}`}; ${ledgerMatches.size} of ${mineProps.length} priced props matched to their replayed game`);
      }
    } catch (err) {
      say(`props' projections left out (${String(err?.stack ?? err).slice(0, 300)})`);
      propsProj = null;
    }
  }

  // (layer b, props: priced walk-forward, at the saved raw chance and at the replayed one (a row with no replayed game,
  // the NFL's anytime touchdowns, an MLB playoff game the logs don't have, at its saved chance either way, so both
  // versions read it the same); the other sports' rows at their saved chances, training only)
  const savedM = (b) => (fin(b.modelRaw) ? b.modelRaw : b.model);
  // (the history's props first: its anchor fit walk-forward by season (gate-history.mjs propHistoryRows, D33) prices
  // the ledger's replayed rows at the newest season's pull, the one the live desk reads)
  const histProps = histMatches.length ? propHistoryRows(V, sport, histIndex, histMatches, current) : { open: [], close: [], anchor: null };
  if (hist.props.length) say(`history props: ${histIndex.size} player games in the history, ${histProps.close.length} closes and ${histProps.open.length} opens matched to the replay${histProps.anchor ? `; the anchor's pull by stat: ${V.anchor.anchorText(histProps.anchor.all)}` : ''}${histProps.risk && V.lineupRisk?.riskText ? `; the lineup risk by stat: ${V.lineupRisk.riskText(histProps.risk)}` : ''}`);
  for (const [id, { b, mu, params: fp, mix }] of ledgerMatches) {
    const fairOver = b.side === 'over' ? b.fair : 1 - b.fair;
    const a = V.anchor && histProps.anchor?.on ? V.anchor.anchoredChances(b.line, mu, fp, mix, fairOver, V.anchor.anchorEntry(histProps.anchor.current, b.propType)) : null;
    const pOver = a ? a.over : V.project.lineChances(b.line, mu, fp, mix).over;
    if (fin(pOver)) replayM.set(id, b.side === 'over' ? pOver : 1 - pOver);
  }
  const priceWith = (mOf, label) => {
    const pOver = pricePropsWalk(V, sport, priced, mOf, { log: (s) => say(`${label}: ${s}`) });
    return mineProps.filter((b) => pOver.has(String(b.id))).map((b) => {
      const x = propRow(b, pOver.get(String(b.id)));
      return { ...x, stake: stakesOf(V, x, evScale) };
    });
  };
  const propsSaved = mineProps.length ? priceWith(savedM, 'saved chances') : [];
  const propsReplay = mineProps.length && replayM.size ? priceWith((b) => (b.sport === sport ? (replayM.get(String(b.id)) ?? savedM(b)) : savedM(b)), 'replayed chances') : null;
  const practiceN = V.desk.PRACTICE_N?.[sport] ?? { nfl: 15, nhl: 6, mlb: 3, nba: 8 }[sport];
  // (the version against the book at the close, every season recency-weighted, and season by season)
  const vs = {
    lines: vsBook(histLines.close),
    props: vsBook(histProps.close),
    linesBySeason: vsBookBySeason(histLines.close),
    propsBySeason: vsBookBySeason(histProps.close),
    linesByMarket: Object.fromEntries(MARKETS.map((m) => [m, vsBook(histLines.close.filter((x) => x.market === m))])),
  };
  return {
    sport,
    notes,
    current,
    code: codeOf(dir),
    epoch: V.leagues.MODEL_EPOCH ?? null,
    proj: { games, props: propsProj },
    bet: { props: { saved: propsSaved, replay: propsReplay }, lines: { saved: linesSaved, replay: linesReplay }, history: { saved: [], replay: slim([...histLines.open, ...histProps.open]) } },
    vsBook: vs,
    // (the anchor (D33): the fit on every season to date (all: what --record writes for the live desk), each
    // season's as the replay read it (bySeason), the newest season's (current))
    anchor: histProps.anchor ?? null,
    // (the lineup risk (D42): each stat's survival of the Bot's edge from the open to the close, what --record writes)
    risk: histProps.risk ?? null,
    meta: { practiceN, practiceUnits: V.desk.PRACTICE_UNITS ?? 0.5, trust, sigma: params.sigma, sigmaT: params.sigmaT, matched: replayM.size, priced: mineProps.length },
  };
}

// ---- comparing two versions' scores ----

// (layer a's rows from a score: games, each final's margin and total log scores summed; props, each player game
// kept (a stat's eligible ones where it has 200))
export function projRows(score) {
  const games = (score.proj?.games ?? []).map(([id, day, season, lm, lt]) => ({ k: id, c: day, season, v: fin(lm) && fin(lt) ? lm + lt : null }));
  let props = null;
  const p = score.proj?.props;
  if (p?.loss?.length) {
    props = [];
    for (let i = 0; i < p.loss.length; i++) {
      const st = p.stats[p.stat[i]];
      props.push({ k: `${st}|${p.pid[i]}|${p.game[i] || p.day[i]}`, c: `${st}|${p.day[i]}`, season: p.season[i], v: p.loss[i] });
    }
  }
  // (the MMA's layers (gate-mma.mjs): each bout's moneyline, each bout's round totals at its lines)
  const one = (list) => (list ? list.map(([id, day, season, l]) => ({ k: id, c: day, season, v: l })) : null);
  return { games, props, bouts: one(score.proj?.bouts), totals: one(score.proj?.totals) };
}

// (the games' CRPS, margin and total summed: reported, never deciding)
const crpsRows = (score) => (score.proj?.games ?? []).map(([id, day, season, , , cm, ct]) => ({ k: id, c: day, season, v: fin(cm) && fin(ct) ? cm + ct : null }));

const stakeOfRow = (ev, odds, x, side) => x.stake?.[side] ?? 0;
// (a betting layer's rows: the replayed chances where both versions have them, else the saved)
const betRows = (a, b, layer) => {
  const ra = a.bet?.[layer]?.replay;
  const rb = b.bet?.[layer]?.replay;
  if (ra?.length && rb?.length) return { mode: 'replay', a: ra, b: rb };
  return { mode: 'saved', a: a.bet?.[layer]?.saved ?? [], b: b.bet?.[layer]?.saved ?? [] };
};

// Two versions' scores for a sport compared: { proj, bet, summary, verdict }
export function compareScores(sport, a, b, opts = {}) {
  const pa = projRows(a);
  const pb = projRows(b);
  const current = Math.max(a.current ?? -Infinity, b.current ?? -Infinity);
  const proj = {
    games: pa.games.length && pb.games.length ? projCompare(sport, pa.games, pb.games, current, opts) : null,
    props: pa.props?.length && pb.props?.length ? projCompare(sport, pa.props, pb.props, current, opts) : null,
    ...(pa.bouts?.length && pb.bouts?.length ? { bouts: projCompare(sport, pa.bouts, pb.bouts, current, opts) } : {}),
    ...(pa.totals?.length && pb.totals?.length ? { totals: projCompare(sport, pa.totals, pb.totals, current, opts) } : {}),
  };
  const n = a.meta?.practiceN ?? 6;
  const practice = a.meta?.practiceUnits ?? 0.5;
  const bet = {};
  const summary = {};
  for (const layer of ['props', 'lines', 'history']) {
    const r = betRows(a, b, layer);
    if (!r.a.length || !r.b.length) {
      bet[layer] = null;
      continue;
    }
    bet[layer] = { mode: r.mode, ...betCompare(r.a, r.b, { n: layer === 'props' ? n : Math.max(1, Math.round(n / 2)), practice, stakeOf: stakeOfRow, ...opts }) };
    summary[layer] = { mode: r.mode, champion: betSummary(r.a, { n, practice, stakeOf: stakeOfRow }), candidate: betSummary(r.b, { n, practice, stakeOf: stakeOfRow }) };
  }
  const verdict = sportVerdict({ proj, bet: Object.fromEntries(Object.entries(bet).filter(([, v]) => v)) });
  const ga = crpsRows(a);
  const gb = crpsRows(b);
  const info = { crps: ga.length && gb.length ? projCompare(sport, ga, gb, current, opts) : null };
  return { sport, proj, bet, summary, info, verdict, vsBook: { champion: a.vsBook ?? null, candidate: b.vsBook ?? null } };
}

// ---- the scorecard ----

// The frozen benchmark's ids (gate-frozen.json): { at, to, sports: { <sport>: { props: [ids], lines: [ids] } } }
export function frozenOf(ledgers, to) {
  const sports = {};
  for (const s of SPORTS) {
    const bets = (ledgers[s]?.bets ?? []).filter((b) => decided(b) && !b.void && Date.parse(b.start) < Date.parse(to) && Date.parse(b.start) >= Date.parse(PROP_FROM));
    sports[s] = { props: bets.filter((b) => b.market === 'prop').map((b) => String(b.id)).sort(), lines: bets.filter((b) => MARKETS.includes(b.market)).map((b) => String(b.id)).sort() };
  }
  return { at: new Date().toISOString(), from: PROP_FROM, to, backtest: 'every Pinnacle-anchored backtest.json bet', sports };
}

// One version's scorecard numbers for a sport from its score: on the frozen set and the rolling set (the last
// ROLLING_DAYS to the newest graded row), props and lines each: { n, gap (the model's log loss less the book's),
// closeGap, clv and hit (the top picks'), units (the top picks' at the practice stake) }
export function scorecardOf(score, frozen, { now = Date.now() } = {}) {
  const n = score.meta?.practiceN ?? 6;
  const practice = score.meta?.practiceUnits ?? 0.5;
  const pick = (layer) => score.bet?.[layer]?.replay?.length ? { mode: 'replay', rows: score.bet[layer].replay } : { mode: 'saved', rows: score.bet?.[layer]?.saved ?? [] };
  const ids = frozen?.sports?.[score.sport] ?? { props: [], lines: [] };
  const out = { frozen: {}, rolling: {} };
  for (const layer of ['props', 'lines']) {
    const { mode, rows } = pick(layer);
    const fz = new Set(ids[layer] ?? []);
    const inFrozen = rows.filter((x) => x.src === 'backtest' || fz.has(x.id));
    const graded = rows.filter((x) => x.y !== null && x.src !== 'backtest');
    const newest = graded.length ? Math.max(...graded.map((x) => x.t)) : now;
    const from = Math.min(newest, now) - ROLLING_DAYS * 864e5;
    const roll = rows.filter((x) => x.src !== 'backtest' && x.t >= from);
    const sum = (list) => {
      if (!list.length) return null;
      const s = betSummary(list, { n: layer === 'props' ? n : Math.max(1, Math.round(n / 2)), practice, stakeOf: stakeOfRow });
      return { n: s.rows, gap: s.gap, closeGap: s.closeGap, clv: s.top.clv, hit: s.top.hit, picks: s.top.n, units: s.top.units, edgeUnits: s.edge.units, edgeN: s.edge.n };
    };
    out.frozen[layer] = sum(inFrozen) && { mode, ...sum(inFrozen) };
    out.rolling[layer] = sum(roll) && { mode, ...sum(roll), from: new Date(from).toISOString().slice(0, 10) };
  }
  // (the priced history against the book at the close: every season recency-weighted, and by season)
  if (score.vsBook) out.history = score.vsBook;
  // (the anchor's pull by stat (D33): the fit on every season to date, the readout the owner watches fall as the
  // bot's own numbers improve; 0 a stat priced at the bot's own number)
  if (score.anchor?.all?.stats) out.anchor = Object.fromEntries(Object.entries(score.anchor.all.stats).map(([k, v]) => [k, { pull: v.pull, d: v.d, n: v.n, gain: v.gain }]));
  // (layer a's deciding seasons' mean loss a row: games, props)
  const pr = projRows(score);
  const projMean = (rows) => {
    let w = 0;
    let s = 0;
    for (const r of rows ?? []) {
      const sw = seasonWeight(score.sport, r.season, score.current);
      if (!sw.decides || !fin(r.v)) continue;
      w += sw.w;
      s += sw.w * r.v;
    }
    return w > 0 ? r4(s / w) : null;
  };
  out.proj = { games: projMean(pr.games), props: projMean(pr.props), ...(pr.bouts ? { bouts: projMean(pr.bouts) } : {}), ...(pr.totals ? { totals: projMean(pr.totals) } : {}) };
  // (the MMA's by-market table (gate-mma.mjs): raw, priced and the Book at the close and the open; and its history trust)
  if (score.sport === 'mma' && score.vsBook?.linesByMarket) out.markets = { close: score.vsBook.linesByMarket, open: score.vsBook.openByMarket ?? null, byBand: score.vsBook.openByBand ?? null, beat: score.vsBook.beat ?? null };
  if (score.trustPrior) out.trust = Object.fromEntries(Object.entries(score.trustPrior).filter(([k]) => k !== 'rows' && k !== 'periods').map(([k, v]) => [k, k === 'match' ? v : { trust: v.trust, n: v.n, clvN: v.clvN, eff: v.eff, fitted: v.fitted, ...(v.bands ? { bands: Object.fromEntries(Object.entries(v.bands).map(([b, f]) => [b, { trust: f.trust, rows: f.rows, fitted: f.fitted }])) } : {}) }]));
  return out;
}

export const SCORECARD_V = 1;
// The scorecard with a version's entry added (one per epoch and commit: a run again replaces it), oldest first
export function addEntry(file, entry) {
  const sc = file && Array.isArray(file.entries) ? file : { v: SCORECARD_V, sport: entry.sport, frozen: entry.frozenTo, entries: [] };
  const key = (e) => `${e.epoch}|${e.commit}`;
  const entries = sc.entries.filter((e) => key(e) !== key(entry));
  entries.push(entry);
  entries.sort((x, y) => String(x.epoch).localeCompare(String(y.epoch)) || String(x.at).localeCompare(String(y.at)));
  return { ...sc, v: SCORECARD_V, sport: entry.sport, entries };
}

// ---- the report ----

const sgn = (v, d = 4) => (fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}` : '-');
const pct = (v) => (fin(v) ? `${(v * 100).toFixed(1)}%` : '-');
export function tableOf(c) {
  const lines = [];
  const row = (what, x, better = 'lower') => lines.push(`  ${what.padEnd(26)} ${x ? `${String(x.a ?? '-').padStart(9)} ${String(x.b ?? '-').padStart(9)} ${sgn(x.diff).padStart(9)}  [${sgn(x.lo)}, ${sgn(x.hi)}]  ${x.verdict ?? ''}${x.rows ? `  (${x.rows} rows)` : x.n ? `  (${x.n} clusters)` : ''}` : '  n/a'}${better === 'higher' ? '  (higher better)' : ''}`);
  lines.push(`${c.sport.toUpperCase()}: ${c.verdict.pass ? (c.verdict.beats ? 'BEATS' : 'TIES') : 'WORSE'}${c.verdict.why.length ? ` (${c.verdict.why.join('; ')})` : ''}${c.verdict.flags.length ? ` [flags: ${c.verdict.flags.join('; ')}]` : ''}`);
  lines.push(`  ${'measure'.padEnd(26)} ${'champion'.padStart(9)} ${'candidate'.padStart(9)} ${'diff'.padStart(9)}  [95%]`);
  row('a: games, deciding', c.proj.games?.decide);
  row('a: games, older (sanity)', c.proj.games?.sanity);
  row('a: games CRPS (reported)', c.info?.crps?.decide);
  row('a: props, deciding', c.proj.props?.decide);
  row('a: props, older (sanity)', c.proj.props?.sanity);
  if (c.proj.bouts) row('a: bouts (ML), deciding', c.proj.bouts.decide), row('a: bouts, older (sanity)', c.proj.bouts.sanity);
  if (c.proj.totals) row('a: round totals, deciding', c.proj.totals.decide), row('a: round totals, older', c.proj.totals.sanity);
  for (const layer of ['props', 'lines', 'history']) {
    const b = c.bet[layer];
    if (!b) {
      lines.push(`  b: ${layer}: no priced rows`);
      continue;
    }
    row(`b: ${layer} log loss (${b.mode})`, b.ll);
    row(`b: ${layer} close log loss`, b.close);
    row(`b: ${layer} top picks' CLV`, b.topClv, 'higher');
    row(`b: ${layer} top picks' hit`, b.topHit, 'higher');
    row(`b: ${layer} edge units a slate`, b.units, 'higher');
    const s = c.summary[layer];
    if (s) for (const [who, x] of [['champion', s.champion], ['candidate', s.candidate]]) lines.push(`    ${who}: ${x.rows} rows, gap to the Book ${sgn(x.gap)} (close ${sgn(x.closeGap)}), top ${x.top.n} picks hit ${pct(x.top.hit)} CLV ${sgn(x.top.clv, 3)} ${sgn(x.top.units, 2)}u at the practice stake; edge ${x.edge.n} picks ${sgn(x.edge.units, 2)}u on ${x.edge.staked}u`);
  }
  const vb = c.vsBook?.candidate;
  if (vb) {
    lines.push("  the candidate against the Book at the history's closes (log loss on the results, recency-weighted; lower better):");
    for (const k of ['lines', 'props']) {
      const x = vb[k];
      if (x) lines.push(`    ${k.padEnd(6)} model ${x.model} (raw ${x.raw}${fin(x.anch) ? `, anchored ${x.anch}` : ''}) / book ${x.book}: ${sgn(x.gap)} [${sgn(x.lo)}, ${sgn(x.hi)}] ${x.verdict} (${x.n} rows, ${x.games} games)`);
    }
    // (the MMA's by market, the open beside the close)
    if (c.sport === 'mma')
      for (const m of MMA_MARKETS) {
        const x = vb.linesByMarket?.[m];
        const o = vb.openByMarket?.[m];
        if (x) lines.push(`    ${m.padEnd(6)} close: raw ${x.raw} / priced ${x.model} / book ${x.book}: ${sgn(x.gap)} [${sgn(x.lo)}, ${sgn(x.hi)}] ${x.verdict} (${x.n} rows)${o ? `; open: raw ${o.raw} / priced ${o.model} / book ${o.book}: ${sgn(o.gap)} ${o.verdict}` : ''}`);
        for (const [band, y] of Object.entries(vb.openByBand?.[m] ?? {})) {
          const bc = vb.beat?.[m]?.[band];
          if (y) lines.push(`      ${band.padEnd(6)} raw ${y.raw} / priced ${y.model} / book ${y.book}: ${sgn(y.gap)} [${sgn(y.lo)}, ${sgn(y.hi)}] ${y.verdict} (${y.n} rows)${bc ? `; top picks ${bc.picks}: beat the close ${pct(bc.beat)}, CLV ${sgn(bc.clv, 3)}, hit ${pct(bc.hit)}, ${sgn(bc.units, 1)}u` : ''}`);
        }
      }
  }
  return lines.join('\n');
}

// ---- the CLI ----

function scoreIn(version, sport, { refit, props }) {
  const out = path.join(GATE, 'scores', `${(version.sha ?? 'worktree').slice(0, 12)}${version.spec.startsWith('env:') ? `-${createHash('sha1').update(version.spec).digest('hex').slice(0, 8)}` : version.spec === 'worktree' ? '-wt' : ''}-${sport}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  const args = [fileURLToPath(import.meta.url), '--score', version.dir, '--sport', sport, '--out', out, ...(refit ? ['--refit'] : []), ...(props ? [] : ['--no-props'])];
  const res = spawnSync(process.execPath, ['--max-old-space-size=8192', ...args], { cwd: ROOT, env: { ...process.env, ...version.env }, stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.status !== 0) throw new Error(`${version.label} ${sport}: the scoring failed (exit ${res.status})`);
  return JSON.parse(readFileSync(out, 'utf8'));
}

function recordScore(version, sport, score, frozen) {
  const file = path.join(ROOT, 'apps', sport, 'src/StaticData/model/scorecard.json');
  const sc = scorecardOf(score, frozen);
  let commitAt = null;
  try {
    if (version.sha) commitAt = git(['log', '-1', '--format=%cI', version.sha]).trim();
  } catch {
    // (no git)
  }
  const entry = { sport, epoch: score.epoch, commit: version.sha ? version.sha.slice(0, 8) : null, commitAt, label: version.spec, at: new Date().toISOString(), frozenTo: frozen?.to ?? null, ...sc };
  const next = addEntry(readJson(file, null), entry);
  writeFileSync(file, `${JSON.stringify(next, null, 1)}\n`);
  console.log(`${sport}: scorecard entry for ${version.label} (epoch ${score.epoch}) written: ${path.relative(ROOT, file)}`);
  // (the leak hunt on the priced history, every season: the weekly self-check's C23 reports it beside the ledger's)
  // (the anchor's fit on every season to date (D33): what the live desk reads, apps/<sport>/src/StaticData/model/
  // anchor.json; a version without the anchor leaves the file as it is)
  if (score.anchor?.all) {
    const out = path.join(ROOT, 'apps', sport, 'src/StaticData/model/anchor.json');
    writeFileSync(out, `${JSON.stringify({ ...score.anchor.all, sport, epoch: score.epoch, commit: entry.commit }, null, 1)}\n`);
    console.log(`${sport}: the anchor's pull by stat written (${path.relative(ROOT, out)}${score.anchor.all.on === false ? ', the readout only: the anchor is off for this sport' : ''}): ${Object.entries(score.anchor.all.stats).map(([k, v]) => `${k} ${v.pull}`).join(', ')}`);
  }
  // (the MMA's history prior (gate-mma.mjs trustPrior, DECISIONS.md D36): each market's trust fit on the priced history,
  // what the live desk reads (mma-desk.mjs readTrustPrior), and the rows it pools with its own bets)
  if (score.trustPrior) {
    const { rows, ...prior } = score.trustPrior;
    const out = path.join(ROOT, 'apps', sport, 'src/StaticData/model/trust-prior.json');
    writeFileSync(out, `${JSON.stringify({ sport, epoch: score.epoch, commit: entry.commit, at: entry.at, ...prior }, null, 1)}\n`);
    const rowsOut = path.join(ROOT, 'apps', sport, 'scripts/model/history-rows.json');
    writeFileSync(rowsOut, `${JSON.stringify({ sport, epoch: score.epoch, commit: entry.commit, at: entry.at, current: score.current, n: rows.length, rows })}\n`);
    console.log(`${sport}: the history's trust prior written (${path.relative(ROOT, out)}: ${Object.entries(prior).filter(([k]) => k !== 'periods' && k !== 'match').map(([k, v]) => `${k} ${v.trust} on ${v.rows} rows`).join(', ')}; ${rows.length} rows in ${path.relative(ROOT, rowsOut)})`);
  }
  // (the lineup risk's fit on the priced history (D42): what the live desk reads, apps/<sport>/src/StaticData/model/
  // lineup-risk.json; a version without it leaves the file as it is)
  if (score.risk?.stats) {
    const out = path.join(ROOT, 'apps', sport, 'src/StaticData/model/lineup-risk.json');
    writeFileSync(out, `${JSON.stringify({ ...score.risk, sport, epoch: score.epoch, commit: entry.commit }, null, 1)}\n`);
    console.log(`${sport}: the lineup risk by stat written (${path.relative(ROOT, out)}): ${Object.entries(score.risk.stats).map(([k, v]) => `${k} ${v.kept ?? 'none'}`).join(', ')}`);
  }
  const hrows = score.bet?.history?.replay ?? [];
  if (hrows.length) {
    const h = huntLeaks(historyLeakBets(hrows), { sport });
    const out = path.join(ROOT, 'apps', sport, 'src/StaticData/model/history-leaks.json');
    writeFileSync(out, `${JSON.stringify({ at: entry.at, epoch: score.epoch, commit: entry.commit, n: h.n, tested: h.tested, leaks: h.leaks, trends: h.trends, status: h.status, headline: h.headline, rows: h.rows.filter((x) => x.kind === 'leak').slice(0, 12) }, null, 1)}\n`);
    console.log(`${sport}: the priced history's leak hunt: ${h.leaks} leaks of ${h.tested} segments on ${h.n} rows (${path.relative(ROOT, out)})`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const val = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const flags = new Set(['--candidate', '--champion', '--score', '--sport', '--out', '--json', '--score-only']);
  const named = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
  const sports = named.filter((s) => SPORTS.includes(s));
  const list = sports.length ? sports : SPORTS;
  const refit = args.includes('--refit');
  const props = !args.includes('--no-props');
  if (args.includes('--score')) {
    const score = await scoreVersion(val('--score'), val('--sport'), { refit, propsLayer: props, log: (s) => console.log(`  [${path.basename(path.dirname(val('--score')))}] ${s}`) });
    writeFileSync(val('--out'), JSON.stringify(score));
    return;
  }
  if (args.includes('--freeze')) {
    const ledgers = Object.fromEntries(SPORTS.map((s) => [s, ledgerOf(s)]));
    const to = val('--to') ?? '2026-10-19T00:00:00Z';
    const fz = frozenOf(ledgers, to);
    writeFileSync(FROZEN_FILE, `${JSON.stringify(fz, null, 1)}\n`);
    console.log(`frozen benchmark written (${path.relative(ROOT, FROZEN_FILE)}): ${SPORTS.map((s) => `${s} ${fz.sports[s].props.length} props, ${fz.sports[s].lines.length} lines`).join('; ')}`);
    return;
  }
  const frozen = readJson(FROZEN_FILE, null);
  if (args.includes('--score-only')) {
    const v = resolveVersion(val('--score-only'));
    for (const sport of list) {
      const score = scoreIn(v, sport, { refit, props });
      if (args.includes('--record')) recordScore(v, sport, score, frozen);
      else console.log(JSON.stringify(scorecardOf(score, frozen), null, 1));
    }
    return;
  }
  const champion = resolveVersion(val('--champion') ?? 'origin/master');
  const candidate = resolveVersion(val('--candidate') ?? 'worktree');
  console.log(`the gate: champion ${champion.label}, candidate ${candidate.label}; ${list.join(', ')}`);
  const ca = codeOf(champion.dir);
  const cb = codeOf(candidate.dir);
  const changed = Object.keys(ca).filter((k) => ca[k] !== cb[k]);
  console.log(`code changed: ${changed.length ? changed.join(', ') : 'none of the scored parts'}${Object.keys(candidate.env).length ? `; flags ${JSON.stringify(candidate.env)}` : ''}`);
  if (changed.includes('live')) console.log("live-only code changed (the run's news, CHECKs, timing, rungs, odds): the replay can't see it; the gate reads it as a tie, so judge that part by its own test");
  if (changed.includes('props') && !refit) console.log("the props' code changed: both versions replayed under the one saved fit's settings; a change to the fit's search itself needs --refit (each version searches its own: the NFL's about 27 minutes each)");
  const results = {};
  const report = [];
  for (const sport of list) {
    const a = scoreIn(champion, sport, { refit, props });
    const b = scoreIn(candidate, sport, { refit, props });
    const c = compareScores(sport, a, b);
    results[sport] = c;
    report.push(tableOf(c));
    if (args.includes('--record')) recordScore(candidate, sport, b, frozen);
  }
  const verdict = gateVerdict(Object.fromEntries(Object.entries(results).map(([s, c]) => [s, c.verdict])));
  console.log(`\n${report.join('\n\n')}\n`);
  console.log(`VERDICT: ${verdict.verdict}: ${verdict.why.join('; ')}`);
  if (verdict.exception?.eligible) console.log(`OWNER MAY SHIP (D22's exception, the close leg alone): ${verdict.exception.why.join('; ')}`);
  console.log(`(deciding: layer a's current and last ${2} seasons inside each sport's rule era; layer b's ${BET_DECIDE.join(', ')}; worse beyond noise = the 95% bootstrap interval wholly worse)`);
  if (val('--json')) writeFileSync(val('--json'), JSON.stringify({ champion: champion.label, candidate: candidate.label, changed, verdict, results }, null, 1));
  if (verdict.verdict === 'HOLD') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// (kept for the tests: the binary loss on a row)
export { binLoss };
