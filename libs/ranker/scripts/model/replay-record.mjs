// The replayed record: what today's Bot would have done over the whole priced history (the owner, 2026-10-19: "since
// the Bot is agnostic, update the Algorithm history with the bets and confidence bands it WOULD have made against
// the history. With full history we can change the algo and keep an honest history, since it's a bot and not a
// human"). The Bot's history everywhere the site shows it is this replay over the rows before the current
// MODEL_EPOCH plus the live ledger's real bets on the games since it (the same algorithm, so they are the replay
// going forward): picks.mjs merges the two into picks.json's record and recent blocks (mergeRecord, mergeRecent),
// the Book's band headers, its Recent form card and the Algorithm tab read those.
//
//   rows       the gate's priced history (gate-history.mjs, gate-mma.mjs): every archived game line since 2020 and
//              prop since 2023 at the open and the close, each priced walk-forward by the version (its ratings and
//              projections from the games before, the trust by the months before, the anchor by the seasons before,
//              the residual by the snapshots before): nothing a row is priced with comes from after its placement
//   placement  the Bot's own rule (DECISIONS.md D42): the clean open (seen after both sides' previous game, inside
//              the sport's window, leagues.mjs TIMING) where its edge held to the lineup risk's surviving share still
//              clears the price, the risk fit on the seasons before the row's (lineup-risk.mjs survivalAt: no
//              evidence, no early bet); else the close, where it is bet if it clears the vig. MMA's open as the
//              archive has it, priced by its lead band (D37). A row never clears: PASS, never bet, a slate's practice
//              pick where the quota says (desk.mjs slateQuota, practiceTop: an edge before the vig, PRACTICE_UNITS,
//              a LIKE at most, on its own line, PRACTICE_SPLIT)
//   price      DraftKings' snapshot nearest the placement (the archive's open or close), never a shopped price;
//              the stake desk.mjs stakeFor at the state's evScale, a suspect return (EV_SUSPECT) held to the
//              practice stake; the band picks.mjs edgeLevel on the Kelly at the chance it was bet at
//   facts      no look-ahead by timestamp (DECISIONS.md D48): each row carries factsAt, the latest fact its price read
//              (a result's end, a day-of fact: the inactives, a goalie, a starter, a lineup, the weather, the crew;
//              gate-history.mjs prices each line as of its own snapshot, ratings.mjs replay's asOf, the day-of terms at
//              what was known then). A row whose factsAt is after its snapshot is never bet there: an open falls to
//              the close, a close (or a row with no snapshot time) isn't bet or picked. Every bet keeps its factsAt
//              and the file counts the bets past their placement (flags.facts.late: 0, tests/model-replay-record)
//   not seen   the live desk's gates (line and prop CLV gates shrink stakes on the ledger since the epoch), its
//              CHECKs, research and news: the replay bets at the model's own number
//   file       apps/<sport>/src/StaticData/model/replay-record.json, written only by gate.mjs --record (a shipped
//              version; the Loops rule: never the hourly desk): the summaries, the last REPLAY_LAST bets, the last
//              REPLAY_DAYS days, and the honesty flags (open against close, context coverage by season, the price
//              convention). Small: no row list
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expectOf } from './live-check.mjs';
import path from 'node:path';
import * as WINDOWS from './windows.mjs';
import * as REASONS from './reasons.mjs';
import * as SHOP from './best-price.mjs';
import * as LEAN from './lean.mjs';

export const REPLAY_V = 1;
export const REPLAY_LAST = 20;
export const REPLAY_DAYS = 14;
const STREAK_CAP = 60;
// (a replayed game's settled time: its start plus a game's length)
export const GAME_HOURS = 3;
// (a clean open: seen after both sides' previous game ended, that game's start plus this)
const PREV_GAME_HOURS = 4;
export const PRICE_NOTE = "the best US book's price at the placement where the deep history has the other books at that snapshot (D74), else the Book's own (the archive's open or close)";
export const PLACEMENT_NOTE = 'a clean open inside the window where the edge held to the lineup risk clears the price, else the close';
// (MMA, D37: the Bot bets a bout at the archive's first sighting where its lead band's price clears, two weeks or more
// out on a soft opening line; the paper edge there is largest where real money is hardest to get down)
export const MMA_PLACEMENT_NOTE = "the archive's first sighting of the bout where the lead band's trusted price clears (D37: a soft opening line two weeks or more out, where real money is hardest to get down), else the close";

const fin = Number.isFinite;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));
const yearOf = (t) => etDay(t).slice(0, 4);
const LINES = new Set(['ml', 'spread', 'total']);
const isLine = (x) => LINES.has(x.market);
const WALLET_MARKET = { ml: 'moneyline', prop: 'prop', spread: 'spread', total: 'total' };
const BANDS = ['lock', 'high', 'medium'];

// A tally: the bets graded, won, lost, pushed, the units staked and won, the return, and how many beat the fair close
// (D56, fairBeatOf: the bets placed at an open with a close at their own line; beat the share, beatN the count, clv
// their mean expected return at the fair close)
// (fairProfit: the same bets paid at their fair no-vig chance (bet.fair, its side's), same results: the Algorithm
// tab's Vig column alone (the owner, 2026-10-26), display only; a bet without a fair chance adds its own profit, no gap)
export const emptyTally = () => ({ bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0, roi: null, beat: 0, beatN: 0, clv: 0, fairProfit: 0 });
export const fairProfitOf = (b) => (fin(b.fair) && b.fair > 0 && b.fair < 1 ? (b.res === 'W' ? b.units * (1 / b.fair - 1) : b.res === 'L' ? -b.units : 0) : null);
export function addBet(t, b) {
  t.fairProfit = r4((t.fairProfit ?? 0) + (fairProfitOf(b) ?? b.profit));
  t.bets++;
  t[b.res === 'W' ? 'won' : b.res === 'L' ? 'lost' : 'push']++;
  t.staked = r2(t.staked + b.units);
  t.profit = r2(t.profit + b.profit);
  t.roi = t.staked ? r4(t.profit / t.staked) : null;
  if (b.beat === 1 || b.beat === 0) {
    t.beatN++;
    t.beat += b.beat;
    t.clv += fin(b.clv) ? b.clv : 0;
  }
  return t;
}
const finishTally = (t) => ({ ...t, beat: t.beatN ? r4(t.beat / t.beatN) : null, clv: t.beatN ? r4(t.clv / t.beatN) : null });

// (DECISIONS.md D48: a row's price read only facts from before its snapshot: no factsAt stamp (nothing day-of read,
// a version from before the stamps), or one at or before its time)
export const knownAt = (x) => !fin(x.factsAt) || (fin(x.at) && x.factsAt <= x.at);
// (the bets whose price read a fact dated after their placement: none, ever (the timestamp test))
export const lateFacts = (bets) => bets.filter((b) => fin(b.factsAt) && !(fin(b.at) && b.factsAt <= b.at));
// (a list's largest and smallest by a loop: a spread into Math.max overflows the stack past about 120,000 bets)
const maxOf = (xs) => xs.reduce((m, x) => (x > m ? x : m), -Infinity);
const minOf = (xs) => xs.reduce((m, x) => (x < m ? x : m), Infinity);
const tallyOf = (bets) => finishTally(bets.reduce(addBet, emptyTally()));

// (the clean-open test from the history's events: a row's open is clean when its snapshot came after both teams'
// previous game ended; MMA's and a sport with no events: every open as it is)
export function cleanOpenOf(events) {
  if (!events) return () => true;
  const byTeam = new Map();
  const evOf = new Map();
  for (const e of events.values()) {
    if (!e.id || !e.t) continue;
    evOf.set(String(e.id), e);
    for (const tm of [e.homeName, e.awayName]) {
      if (!tm) continue;
      const a = byTeam.get(tm) ?? byTeam.set(tm, []).get(tm);
      a.push(Date.parse(e.t));
    }
  }
  for (const a of byTeam.values()) a.sort((x, y) => x - y);
  const prevEnd = (tm, t) => {
    let p = -Infinity;
    for (const x of byTeam.get(tm) ?? []) {
      if (x < t - 36e5) p = x;
      else break;
    }
    return p + PREV_GAME_HOURS * 36e5;
  };
  return (x) => {
    const e = evOf.get(String(x.event));
    return !!e && fin(x.at) && x.at > prevEnd(e.homeName, x.t) && x.at > prevEnd(e.awayName, x.t);
  };
}

// The lineup risk fit walk-forward by season (D42, no look-ahead): a season's rows read the fit on the open-close
// pairs of the seasons before it, the props' by stat and the lines' by market, each pool its own; the first season
// (or a version without the module) has none, so its rows wait for the close. { entryFor(season, stat, line) }
export function walkRisk(V, pairs) {
  const fit = V.lineupRisk?.fitLineupRisk;
  const seasons = [...new Set(pairs.map((x) => x.season))].sort((a, b) => a - b);
  const bySeason = new Map();
  // (a season's fit, on the pairs of the seasons before it alone, once)
  const fitFor = (s) => {
    if (bySeason.has(s)) return bySeason.get(s);
    const before = fit ? pairs.filter((x) => x.season < s) : [];
    const one = (list) => (list.length ? fit(list.map(({ stat, eo, ec, moved, lead }) => ({ stat, eo, ec, moved, lead })), { at: `before ${s}` }) : null);
    const f = fit ? { props: one(before.filter((x) => !x.line)), lines: one(before.filter((x) => x.line)) } : null;
    bySeason.set(s, f);
    return f;
  };
  return { seasons, entryFor: (season, stat, line) => fitFor(season)?.[line ? 'lines' : 'props']?.stats?.[stat] ?? null };
}

// The Bot's side of a row and its numbers at the chance p it is bet at: the larger return's side, its price, its
// Kelly (desk.mjs stakeKelly), its return, its edge before the vig. D74: the price is the best US book's where the
// deep history has the other books at the row's own snapshot (best-price.mjs shopRows: x.shop, never worse than
// DraftKings'), its book on the side (book, a code); elsewhere DraftKings' as before
function sideOf(V, x, p) {
  const oA = fin(x.shop?.over) ? x.shop.over : x.overOdds;
  const oB = fin(x.shop?.under) ? x.shop.under : x.underOdds;
  const evA = p * dec(oA) - 1;
  const evB = (1 - p) * dec(oB) - 1;
  const over = evA >= evB;
  const pS = over ? p : 1 - p;
  const fS = over ? x.f : 1 - x.f;
  const odds = over ? oA : oB;
  const book = x.shop ? (over ? x.shop.overBook : x.shop.underBook) : null;
  return { over, pS, fS, odds, ...(book ? { book } : {}), ev: over ? evA : evB, edge: pS - fS, kelly: V.desk.stakeKelly(odds, pS) };
}

// (the bet's words and its game's, as the Book's rows read them)
function wordsOf(x, over, names) {
  const n = names(x);
  if (x.market === 'prop') return { pick: `${x.name ?? x.stat} ${over ? 'Over' : 'Under'} ${x.line}${x.label ? ` ${x.label}` : ''}`, matchup: n.matchup, player: x.name ?? null };
  if (x.sport === 'mma') return { pick: x.market === 'total' ? `${over ? 'Over' : 'Under'} ${x.line} rounds` : `${over ? n.home : n.away} ML`, matchup: n.matchup, player: x.market === 'ml' ? (over ? n.home : n.away) : null };
  if (x.market === 'total') return { pick: `${over ? 'Over' : 'Under'} ${x.line}`, matchup: n.matchup, player: null };
  if (x.market === 'spread') return { pick: `${over ? n.home : n.away} ${over ? (x.line > 0 ? '+' : '') + x.line : (-x.line > 0 ? '+' : '') + -x.line}`, matchup: n.matchup, player: null };
  return { pick: `${over ? n.home : n.away} ML`, matchup: n.matchup, player: null };
}

// Beat the fair close (DECISIONS.md D56, one definition for the replay and the live bets, replay-history.ts
// fairCloseOf): a bet placed before the close beat it when its own price has a positive expected return at the close's
// no-vig fair chance of its side (the close row's f: Pinnacle's where DraftKings' snapshot saw it, else DraftKings'
// own, D48), the vig in its price and out of the fair. Only a close at the bet's own line counts (a moneyline's
// always; a moved spread, total or prop has no close to read: null, never a guess at the carry). { beat 1 | 0, clv
// the expected return } or null. Was (to 2026-10-19): DraftKings' raw closing price against the bet's, the vig in,
// any improvement a beat, a moved line read by its points with the price ignored, ties dropped
export function fairBeatOf(x, over, odds, close) {
  if (!close || !fin(close.f) || close.f <= 0 || close.f >= 1 || !fin(odds) || !odds) return null;
  const same = x.market === 'ml' || (x.line == null && close.line == null) || close.line === x.line;
  if (!same) return null;
  const q = over ? close.f : 1 - close.f;
  const clv = r4(q * dec(odds) - 1);
  return { beat: clv > 0 ? 1 : 0, clv };
}

// The bar's own place (D51): lines bets { season, profit, full? } (full: a barred bet's units, band and profit at its
// full stake); by season, whether the bar applied (the seasons before it, unweighted: the bar's units at least the
// full stakes'; the first season the bar's), and applies, the verdict on every season for what comes next
export function barPlace(bets) {
  const seasons = [...new Set(bets.map((b) => b.season))].filter(fin).sort((a, b) => a - b);
  const bySeason = {};
  let barU = 0;
  let fullU = 0;
  for (const s of seasons) {
    bySeason[s] = barU >= fullU - 1e-9;
    for (const b of bets.filter((x) => x.season === s)) {
      barU += b.profit;
      fullU += b.full ? b.full.profit : b.profit;
    }
  }
  return { applies: barU >= fullU - 1e-9, barUnits: r4(barU), fullUnits: r4(fullU), bySeason };
}

// The replay: every key (a game's market, a player's prop) bet once at most at the Bot's own placement, the slate's
// practice picks, and the record from them. rows: { open, close } of the gate's priced rows (lines and props
// together; each row's at its snapshot's time, t its start, p its priced chance, f the Book's no-vig, y the result);
// events the history's (the clean-open test); names(x) -> { home, away, matchup } the words; epoch the version's
// (only rows whose game starts before it); evScale the state's. Returns the file's content
// confidence: the confidence layer's model (confidence.mjs, D52), fit on these rows walk-forward: each bet's band held to
// the tier cap its quality allows and its stake to the calibrated chance's, as the live desk does (run.mjs
// withConfidence), so the replayed record is the record the Bot would have shown
export function replayRecord(V, sport, rows, { events = null, names = () => ({ home: 'Home', away: 'Away', matchup: '' }), epoch = null, evScale = 0.08, now = Date.now(), sched = null, confidence = null } = {}) {
  const epochT = epoch ? Date.parse(epoch) : Infinity;
  const W = process.env.REPLAY_WINDOWS === '0' ? null : WINDOWS;
  const timing = V.leagues?.TIMING?.[sport] ?? { lines: 26, props: 26, lastChance: 3 };
  const practiceN = V.desk.PRACTICE_N?.[sport] ?? 3;
  const practiceUnits = V.desk.PRACTICE_UNITS ?? 0.5;
  const evSuspect = V.desk.EV_SUSPECT ?? 0.15;
  // (D88: a knob's value for the sport, the self-tune's tuned.json or its override where set; a version without tuned.mjs, the constant)
  const T = (name, def) => (V.tuned?.knob ? V.tuned.knob(sport, name) : def);
  const barOpts = V.desk.barOpts?.(sport) ?? {};
  const level = V.picks?.edgeLevel ?? V.picks?.level ?? ((k) => (k >= 0.05 ? 'lock' : k >= 0.02 ? 'high' : k > 0 ? 'medium' : 'low'));
  const ok = (x) => fin(x.p) && fin(x.f) && !!x.overOdds && !!x.underOdds && fin(x.t) && x.t < epochT;
  const opens = new Map();
  const closes = new Map();
  for (const x of rows.open ?? []) if (ok(x)) opens.set(x.key ?? x.id.replace(/:o$/, ''), x);
  for (const x of rows.close ?? []) if (ok(x)) closes.set(x.key ?? x.id.replace(/:c$/, ''), x);
  const clean = sport === 'mma' ? () => true : cleanOpenOf(events);
  // (the risk's pairs: the open against its close on the Bot's side at the open, as gate-history.mjs builds them)
  const pairs = [];
  for (const [k, o] of opens) {
    const c = closes.get(k);
    if (!c || !fin(o.p) || !fin(c.p)) continue;
    const side = o.p >= o.f ? 1 : -1;
    pairs.push({ season: o.season, stat: o.stat, line: isLine(o), eo: side * (o.p - o.f), ec: side * (c.p - c.f), moved: o.line !== c.line || Math.abs(c.f - o.f) >= (V.lineupRisk?.MOVED_PTS ?? 0.05), lead: fin(o.at) ? (o.t - o.at) / 36e5 : null });
  }
  const risk = walkRisk(V, pairs);
  const survival = V.lineupRisk?.survivalAt ?? (() => 0);
  // (the lines' history bar (desk.mjs walkBar, segmentOf, reasonsOf; D51): a line bet judged on the line picks (the
  // closes and the clean opens) of the months before its own, by its segment (its market, side class and timing) and
  // the named reasons its side carries (sched: desk.mjs scheduleRest by game id), each at its minimum edge, so the
  // replay stakes it as the live desk would have with the history to that day: none on at its return, the practice
  // stake, a LIKE at most; a version without the bar as before)
  const sideName = (x, sd) => (x.market === 'total' ? (sd.over ? 'over' : 'under') : sd.over ? 'home' : 'away');
  const hoursAt = (x) => (fin(x.at) && fin(x.t) ? (x.t - x.at) / 36e5 : x.kind === 'o' ? 24 : 1);
  const keysOf = (x, sd) => [V.desk.segmentOf(x.market, sideName(x, sd), sd.fS, hoursAt(x)), ...(V.desk.reasonsOf && sched ? V.desk.reasonsOf(sport, x.market, sideName(x, sd), sched.get(String(x.event))) : [])];
  const barAt =
    sport !== 'mma' && V.desk.walkBar && V.desk.segmentOf
      ? V.desk.walkBar(
          [...closes.values(), ...[...opens.values()].filter((o) => clean(o))]
            .filter((x) => isLine(x) && (x.y === 0 || x.y === 1))
            .map((x) => {
              const sd = sideOf(V, x, x.p);
              return sd.ev > 0 ? { t: x.t, season: x.season, keys: keysOf(x, sd), ev: sd.ev, profit: (x.y === 1) === sd.over ? dec(sd.odds) - 1 : -1 } : null;
            })
            .filter(Boolean),
          barOpts,
        )
      : null;
  // (the props' stat bar (DECISIONS.md D64): D51's bar on the props, a prop pick judged on the prop picks (every
  // positive-edge close) of the months before its own by its stat and side, "prop:<stat>:<over|under>", at its minimum
  // edge: none on at its return, the practice stake, a LIKE at most; its own place by season below, as the lines'.
  // So a stat the model beats the Book on earns its stakes and one it doesn't bets small. A version without it: none)
  const propKeyOf = (x, sd) => [`prop:${x.stat}:${sd.over ? 'over' : 'under'}`];
  const propBarAt =
    sport !== 'mma' && V.desk.walkBar && (process.env.PROP_BAR_ALL === '1' ? V.desk.PROP_BAR : V.desk.propBarOn?.(sport))
      ? V.desk.walkBar(
          [...closes.values()]
            .filter((x) => x.market === 'prop' && (x.y === 0 || x.y === 1))
            .map((x) => {
              const sd = sideOf(V, x, x.p);
              return sd.ev > 0 ? { t: x.t, season: x.season, keys: propKeyOf(x, sd), ev: sd.ev, profit: (x.y === 1) === sd.over ? dec(sd.odds) - 1 : -1 } : null;
            })
            .filter(Boolean),
          barOpts,
        )
      : null;
  const bets = [];
  const passes = [];
  const hold = new Map();
  // (D76: the bets whose side clears only at a shopped price, each with its return there)
  const shopOnlyBets = new Map();
  // (the prop bets' own lean (D82, lean.mjs): how far the Bot's own chance on the side sits under one half)
  const leanBets = new Map();
  // (D88's margin rule: each bet's { mg: { e, d }, x, sd })
  const marginBets = new Map();
  const flags = { open: 0, close: 0, openSeen: 0, openClean: 0, openInWindow: 0, openHeld: 0, closeHeld: 0, barred: 0 };
  const keys = new Set([...opens.keys(), ...closes.keys()]);
  // (the betting windows (DECISIONS.md D63, windows.mjs): a game line's intraday snapshots (rows.intra, D61) beside its
  // open and close, each a candidate placement at its own price and hours; each segment's policy (the archive's open,
  // else the close, as before; or held till an hour before the start, then the first snapshot whose edge clears)
  // learned walk-forward from the games settled before the bet's moment, paired against the old placement on the same
  // games. A key with no intraday snapshot, a prop, MMA, or a version without the module: placed as before)
  const intraBy = new Map();
  if (W && sport !== 'mma') for (const x of rows.intra ?? []) if (ok(x)) (intraBy.get(x.key) ?? intraBy.set(x.key, []).get(x.key)).push(x);
  for (const list of intraBy.values()) list.sort((a, b) => a.at - b.at);
  // (the sharp lag (DECISIONS.md D92, windows.mjs lagHeld): a line placement before the last chance whose Book's own
  // no-vig on the Bot's side sits LAG_PTS over the sharp book's at the same snapshot waits for a later one, the close
  // the last; a version without it, or REPLAY_LAG=0 (measuring only): none held)
  const lagOn = !!WINDOWS.lagHeld && process.env.REPLAY_LAG !== '0';
  flags.lagHeld = 0;
  const lagHeldOf = (x, sd, hours) => {
    if (!lagOn || !isLine(x) || !x.pin) return false;
    const lag = WINDOWS.lagOf(sd.over ? x.overOdds : x.underOdds, sd.over ? x.underOdds : x.overOdds, sd.over ? x.f : 1 - x.f);
    return WINDOWS.lagHeld(sport, lag, hours, timing.lastChance ?? 3);
  };
  const candOf = (x, kind) => {
    if (!x) return null;
    const hours = kind === 'c' ? 0 : fin(x.at) ? (x.t - x.at) / 36e5 : null;
    if (kind !== 'c') {
      if (!(fin(hours) && hours <= timing.lines && clean(x) && knownAt(x))) return null;
      const s = survival(risk.entryFor(x.season, x.stat, true), hours, { last: timing.lastChance ?? 3 });
      const p = s < 1 ? x.f + Math.min(1, Math.max(0, s)) * (x.p - x.f) : x.p;
      const sd = sideOf(V, x, p);
      return { x, sd, kind, hours, ev: sd.ev, s, seg: W.segOf(x.market, W.classOf(x.market, sd.over, sd.fS)), lag: lagHeldOf(x, sd, hours) };
    }
    if (!knownAt(x)) return null;
    const sd = sideOf(V, x, x.p);
    return { x, sd, kind, hours, ev: sd.ev, s: 1, seg: W.segOf(x.market, W.classOf(x.market, sd.over, sd.fS)) };
  };
  const candsOf = (k) => [candOf(opens.get(k), 'o'), ...(intraBy.get(k) ?? []).map((x) => candOf(x, 'i')), candOf(closes.get(k), 'c')].filter(Boolean);
  const flatOf = (c) => (c.x.y === 1 || c.x.y === 0 ? ((c.x.y === 1) === c.sd.over ? dec(c.sd.odds) - 1 : -1) : 0);
  let win = null;
  if (intraBy.size) {
    const outcomes = [];
    for (const k of intraBy.keys()) {
      const cands = candsOf(k);
      const x0 = closes.get(k) ?? opens.get(k) ?? intraBy.get(k)[0];
      for (const seg of new Set(cands.map((c) => c.seg))) {
        const by = {};
        const clv = {};
        let any = false;
        for (const P of W.POLICIES) {
          const c = W.placeBy(cands, () => P, seg);
          by[P] = c ? flatOf(c) : 0;
          if (c) any = true;
          // (its price against the fair close (D56), where it was placed before the close at the close's line)
          const fb = c && c.kind !== 'c' ? fairBeatOf(c.x, c.sd.over, c.sd.odds, closes.get(k) ?? null) : null;
          if (fb) clv[P] = fb;
        }
        outcomes.push({ t: x0.t + GAME_HOURS * 36e5, seg, by, clv, any });
      }
    }
    win = W.walkWindows(outcomes, { z: T('windowZ', W.WIN_Z), min: T('windowMin', W.WIN_MIN) });
    // (research only (D71): REPLAY_WINDOW_FORCE=h24 places every line segment by that policy, the walk's verdict aside,
    // so the band lab can read the reasons' closing checks had the Bot bet that early; never set by a record)
    const forced = process.env.REPLAY_WINDOW_FORCE;
    if (forced && W.POLICIES.includes(forced)) win = { ...win, at: () => forced };
    // (the band lab's dump (D70) carries the windows' outcomes too (D71), for reading each policy's paired evidence)
    if (process.env.REPLAY_DUMP) {
      try {
        writeFileSync(path.join(process.env.REPLAY_DUMP, `${sport}-windows.json`), JSON.stringify(outcomes));
      } catch {}
    }
    flags.windows = { keys: intraBy.size, final: win.final, placed: {} };
  }
  for (const k of keys) {
    const o = opens.get(k);
    const c = closes.get(k);
    let placed = null;
    if (win && intraBy.has(k)) {
      if (o) {
        flags.openSeen++;
        const hours = fin(o.at) ? (o.t - o.at) / 36e5 : null;
        if (clean(o)) flags.openClean++;
        if (fin(hours) && hours <= timing.lines) flags.openInWindow++;
        if (clean(o) && fin(hours) && hours <= timing.lines && !knownAt(o)) flags.openHeld++;
      }
      const cands = candsOf(k);
      const pick = W.placeBy(cands, (cd) => win.at(cd.x.at ?? cd.x.t, cd.seg));
      if (cands.some((cd) => cd.lag && cd.ev > 0)) flags.lagHeld++;
      if (pick) {
        const pol = win.at(pick.x.at ?? pick.x.t, pick.seg);
        flags.windows.placed[`${pol}:${pick.kind}`] = (flags.windows.placed[`${pol}:${pick.kind}`] ?? 0) + 1;
        placed = { x: pick.x, sd: pick.sd, timing: pick.kind === 'c' ? 'close' : 'open', s: pick.s, close: pick.kind === 'c' ? null : (c ?? null), hours: pick.hours, window: pol };
      } else if (c && !knownAt(c)) flags.closeHeld++;
      else if (c) passes.push({ x: c, sd: sideOf(V, c, c.p) });
      else if (o && knownAt(o)) passes.push({ x: o, sd: sideOf(V, o, o.p) });
    } else if (o) {
      flags.openSeen++;
      const hours = fin(o.at) ? (o.t - o.at) / 36e5 : null;
      // (inside the live desk's window, MMA's too (D56: TIMING.mma 672 hours, mma-desk.mjs AHEAD_DAYS 28): an open
      // first seen further out is a price the live desk never asks for, so the bout waits for its close, as live)
      const inWindow = fin(hours) && hours <= (isLine(o) ? timing.lines : timing.props);
      const isClean = clean(o);
      if (isClean) flags.openClean++;
      if (inWindow) flags.openInWindow++;
      // (an open whose price read a fact posted after it (D48): never bet there, the close instead)
      const isKnown = knownAt(o);
      if (isClean && inWindow && !isKnown) flags.openHeld++;
      if (isClean && inWindow && isKnown) {
        // (the open's chance held to the surviving share of its lean: MMA's priced by its band already)
        const s = sport === 'mma' ? 1 : survival(risk.entryFor(o.season, o.stat, isLine(o)), hours, { last: timing.lastChance ?? 3 });
        const p = s < 1 ? o.f + Math.min(1, Math.max(0, s)) * (o.p - o.f) : o.p;
        const sd = sideOf(V, o, p);
        if (sd.ev > 0 && lagHeldOf(o, sd, hours)) flags.lagHeld++;
        else if (sd.ev > 0) placed = { x: o, sd, timing: 'open', s, close: c ?? null };
      }
    }
    // (a close, or a lone open, whose price read a fact posted after it: neither bet nor picked (D48))
    if (win && intraBy.has(k)) {
      // (placed above, by the windows)
    } else if (!placed && c && !knownAt(c)) flags.closeHeld++;
    else if (!placed && c) {
      const sd = sideOf(V, c, c.p);
      if (sd.ev > 0) placed = { x: c, sd, timing: 'close', s: 1, close: null };
      else passes.push({ x: c, sd });
    } else if (!placed && o && knownAt(o)) {
      passes.push({ x: o, sd: sideOf(V, o, o.p) });
    }
    if (placed) {
      const { x, sd } = placed;
      const suspect = V.desk.isSuspect ? V.desk.isSuspect(sd.pS, sd.ev) : Math.abs(sd.ev) > evSuspect;
      const ev = suspect ? Math.sign(sd.ev) * Math.min(Math.abs(sd.ev), evSuspect) : sd.ev;
      // (a line whose segment hasn't earned its stake by that day: the practice stake, a LIKE, in the record as the
      // live desk's gated bets are)
      const barred = (!!barAt && isLine(x) && !barAt(x.t, keysOf(x, sd), sd.ev)) || (!!propBarAt && x.market === 'prop' && !propBarAt(x.t, propKeyOf(x, sd), sd.ev));
      if (barred) flags.barred++;
      let fullUnits = suspect ? practiceUnits : V.desk.stakeFor(ev, evScale, sd.odds);
      let units = barred ? practiceUnits : fullUnits;
      let band = level(sd.kelly, sd.pS);
      if (band === 'low') band = 'medium';
      let fullBand = suspect && band !== 'medium' ? 'medium' : band;
      if ((suspect || barred) && band !== 'medium') band = 'medium';
      // (the confidence layer (D52): the band held to the tier cap, the stake to the calibrated chance's, never over the
      // rules' stake or under the practice stake; a row the model can't score (before its first snapshot) as it is)
      if (confidence && V.confidence?.qualityOf) {
        let qy = null;
        try {
          qy = V.confidence.qualityOf(confidence, { ...x, side: sd.over ? 'over' : 'under' });
        } catch {
          qy = null;
        }
        if (qy?.cap && V.picks?.capBand) {
          band = V.picks.capBand(band, qy.cap);
          fullBand = V.picks.capBand(fullBand, qy.cap);
        }
        if (qy && !suspect && V.confidence.unitsOf) {
          const u = V.confidence.unitsOf(qy, sd.odds, evScale);
          if (fin(u)) fullUnits = Math.max(practiceUnits, Math.min(fullUnits, u));
          if (!barred) units = fullUnits;
        }
      }
      const bet = betOf(x, sd, { units, band, practice: false, timing: placed.timing, fb: placed.timing === 'open' ? fairBeatOf(x, sd.over, sd.odds, placed.close) : null, names, survival: placed.s });
      // (where a window placed it (D63): its hours before the start and the policy)
      if (placed.window) Object.assign(bet, { hours: r2(placed.hours), window: placed.window });
      // (a barred line keeps what it would have staked at full: the bar's own place below)
      if (barred) bet.full = { units: fullUnits, band: fullBand, profit: units > 0 ? r4((bet.profit * fullUnits) / units) : 0 };
      // (what the reason tiers read (D58, below): the pick's context at its placement and the rules that hold it)
      if (V.reasons?.contextOf) {
        const sideWord = x.market === 'prop' || x.market === 'total' ? (sd.over ? 'over' : 'under') : sd.over ? 'home' : 'away';
        const sdEdge = x.market === 'prop' && fin(x.mu) && fin(x.sd) && x.sd > 0 && fin(x.line) ? ((sd.over ? 1 : -1) * (x.mu - x.line)) / x.sd : null;
        hold.set(bet, { suspect, barred, ctx: V.reasons.contextOf({ sport, market: x.market, side: sideWord, stat: x.stat ?? null, fS: sd.fS, pS: sd.pS, kelly: sd.kelly, odds: sd.odds, early: placed.timing === 'open', pin: !!x.pin, sched: sched && x.market !== 'prop' ? (sched.get(String(x.event)) ?? null) : null, sdEdge }) });
      }
      bets.push(bet);
      if (sd.book && SHOP.shopOnly?.(sd.pS, sd.odds, sd.over ? x.overOdds : x.underOdds, sd.book)) shopOnlyBets.set(bet, sd.ev);
      // (D88's margin rule: the side's price edge e and the Bot's own model under the fair price d)
      if (LEAN.marginOf) {
        const o = x.market === 'prop' ? LEAN.ownOver(x) : fin(x.raw) ? x.raw : null;
        const mg = o === null ? null : LEAN.marginOf({ p: sd.pS, odds: sd.odds, fair: sd.fS, own: sd.over ? o : 1 - o });
        if (mg) marginBets.set(bet, { mg, x, sd });
      }
      if (x.market === 'prop' && LEAN.leanGap) {
        const g = LEAN.leanGap(x, sd.over);
        if (g !== null) leanBets.set(bet, g);
      }
      flags[placed.timing]++;
    }
  }
  // (D88's margin rule (lean.mjs marginHeld, marginSplit): a side the Bot's own model puts under the fair price by d, bet
  // on a price edge e under lambda x d + m (the sport's knobs, lines and props apart) is TRACKED (D90, the owner's
  // exception to D1): it leaves the bets (the record, the bars, the guards, the tiers, the strip) before anything reads
  // them, and joins the passes, so the PASS's as-if tally counts it (D87) and the practice picks never re-stake it.
  // lambda = m = 0: none, the replay as before. flags.margin: by group, the bets held, their units at their stakes,
  // what's left of them in the record (0) and their flat return)
  if (marginBets.size && LEAN.marginSplit) {
    const flatB = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);
    const optsOf = (group) => ({ lambda: T(group === 'props' ? 'leanLambdaProps' : 'leanLambdaLines', 0), m: T(group === 'props' ? 'leanMProps' : 'leanMLines', 0) });
    const { held, flags: fm } = LEAN.marginSplit([...marginBets].map(([bet, it]) => ({ bet, mg: it.mg, x: it.x, sd: it.sd, group: bet.market === 'prop' ? 'props' : 'lines', flat: flatB(bet) })), optsOf);
    if (held.length) {
      const out = new Set(held.map((it) => it.bet));
      for (const it of held) {
        if (it.bet.full) flags.barred--;
        hold.delete(it.bet);
        shopOnlyBets.delete(it.bet);
        leanBets.delete(it.bet);
        passes.push({ x: it.x, sd: it.sd, marginHeld: true });
      }
      const kept = bets.filter((b) => !out.has(b));
      bets.length = 0;
      bets.push(...kept);
    }
    flags.margin = fm;
  }
  // (the bar's own place (DECISIONS.md D51), walk-forward by season: the bar stakes a season's lines only where, on
  // every season before, the lines as it staked them earned at least what they would have at full stakes (the first
  // season, none to judge on, the bar's); where full stakes out-earned it, that season's lines are at their full
  // stakes and bands. So the bar never costs a sport whose staked lines it can't beat (MLB's: its Kelly stakes won
  // where its flat picks lost). barPlace(bets) is the same verdict for what comes next, from every season
  const bar = sport === 'mma' || !barAt ? null : barPlace(bets.filter((b) => b.market !== 'prop'));
  if (bar) {
    for (const b of bets) if (b.full && bar.bySeason[b.season] === false) {
      Object.assign(b, { units: b.full.units, band: b.full.band, profit: b.full.profit });
      if (hold.has(b)) hold.get(b).barred = false;
      flags.barred--;
    }
    flags.bar = { applies: bar.applies, barUnits: bar.barUnits, fullUnits: bar.fullUnits, bySeason: bar.bySeason };
  }
  const pbar = propBarAt ? barPlace(bets.filter((b) => b.market === 'prop')) : null;
  if (pbar) {
    flags.propsBarred = bets.filter((b) => b.market === 'prop' && b.full).length;
    for (const b of bets) if (b.market === 'prop' && b.full && pbar.bySeason[b.season] === false) {
      Object.assign(b, { units: b.full.units, band: b.full.band, profit: b.full.profit });
      if (hold.has(b)) hold.get(b).barred = false;
      flags.propsBarred--;
    }
    flags.barred -= bets.filter((b) => b.market === 'prop' && b.full).length;
    flags.propBar = { applies: pbar.applies, barUnits: pbar.barUnits, fullUnits: pbar.fullUnits, bySeason: pbar.bySeason };
  }
  // (the shopped-price guard (DECISIONS.md D76, best-price.mjs): a bet that clears only at another book's price needs
  // the month's minimum return there (walkShopGuard: picked on the shop-only bets settled before the month), or it is
  // a LIKE at the practice stake, held there through the tiers below as a barred one. Applied in SHOP_GUARD's sports
  // (REPLAY_SHOP_GUARD=1 every sport, =0 none: measuring only); measured everywhere: flags.shopGuard)
  if (shopOnlyBets.size && SHOP.walkShopGuard) {
    const flatB = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);
    const list = [...shopOnlyBets].map(([b, ev]) => ({ b, t: b.t + GAME_HOURS * 36e5, at: fin(b.at) ? b.at : b.t, ev, flat: flatB(b) }));
    const walk = SHOP.walkShopGuard(list);
    const env = process.env.REPLAY_SHOP_GUARD;
    const on = env === '1' ? true : env === '0' ? false : SHOP.shopGuardOn(sport);
    const g = { on, shopOnly: list.length, guarded: 0, flat: 0, before: 0, after: 0, next: walk.final === Infinity ? 'dk' : walk.final };
    for (const it of list) {
      const T = walk.at(it.at);
      if (!(it.ev < T)) continue;
      const b = it.b;
      g.guarded++;
      g.flat = r2(g.flat + it.flat);
      if (!on || b.units <= practiceUnits || hold.get(b)?.barred) continue;
      const profit = b.units > 0 ? r2((b.profit * practiceUnits) / b.units) : 0;
      g.before = r2(g.before + b.profit);
      g.after = r2(g.after + profit);
      Object.assign(b, { units: practiceUnits, band: 'medium', profit, shopGuard: true });
      if (hold.has(b)) hold.get(b).barred = true;
    }
    flags.shopGuard = g;
  }
  // (the against-own-lean guard (D82, lean.mjs): a prop bet whose side the Bot's own chance puts under one half by more
  // than the month's d (walkLean: picked on the against-lean bets settled before the month) is a LIKE at the practice
  // stake, held there as a barred one. On in LEAN_SPORTS (REPLAY_LEAN=1 every sport, =0 none: measuring only))
  if (leanBets.size && LEAN.walkLean) {
    const flatB = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);
    const list = [...leanBets].map(([b, g]) => ({ b, t: b.t + GAME_HOURS * 36e5, at: fin(b.at) ? b.at : b.t, g, flat: flatB(b) }));
    const walk = LEAN.walkLean(list);
    const env = process.env.REPLAY_LEAN;
    const on = env === '1' ? true : env === '0' ? false : !!LEAN.leanOn?.(sport);
    const g = { on, props: list.length, against: list.filter((x) => x.g < 0).length, guarded: 0, flat: 0, before: 0, after: 0, next: walk.final };
    for (const it of list) {
      const d = walk.at(it.at);
      if (d === null || !(it.g < -d)) continue;
      const b = it.b;
      g.guarded++;
      g.flat = r2(g.flat + it.flat);
      if (!on || b.units <= practiceUnits || hold.get(b)?.barred) continue;
      const profit = b.units > 0 ? r2((b.profit * practiceUnits) / b.units) : 0;
      g.before = r2(g.before + b.profit);
      g.after = r2(g.after + profit);
      Object.assign(b, { units: practiceUnits, band: 'medium', profit, leanGuard: true });
      if (hold.has(b)) hold.get(b).barred = true;
    }
    flags.leanGuard = g;
  }
  // (the reason tiers (DECISIONS.md D58, reasons.mjs): each bet's reasons, judged walk-forward on the bets settled
  // before its moment (each market's picks flat, recency-weighted), its would-be tier from the proven ones (a LOVE one,
  // a LOCK two of different families or one strong; the Kelly floor under both), held to the tiers' own place (the
  // would-be tiers' record before its month: LOVE over LIKE, LOCK over LOVE, by return and beat-the-close), and to
  // the rules' caps (a suspect price or a barred line a LIKE at most); its stake held to its tier's cap. This
  // replaces D52's quality caps on the band; D52's stake on the calibrated chance stays under the tier's cap)
  let reasonsFile = null;
  if (V.reasons?.walkReasons && hold.size) {
    const R = V.reasons;
    const flat = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);
    const settle = (b) => b.t + GAME_HOURS * 36e5;
    const mine = bets.filter((b) => hold.has(b));
    for (const b of mine) {
      const h = hold.get(b);
      h.ids = R.reasonsFor(h.ctx).map((r) => r.id);
      h.before = { band: b.band, units: b.units, profit: b.profit };
    }
    // (the closing-line bands (D70, clv-bands.mjs SHIPPED): a reason earns on its bets' shrunk return at the fair
    // close and their beat share, with its results not losing, walk-forward by each bet's placement; REPLAY_BANDS=d58
    // the results tiers (D58) as they were. A version without the module: D58's)
    const C = process.env.REPLAY_BANDS === 'd58' ? null : V.clvBands?.SHIPPED ? V.clvBands : null;
    const rule = C ? C.SHIPPED : null;
    const walk = C ? C.walkClv(mine.map((b) => ({ t: settle(b), at: b.at, market: b.market, ids: hold.get(b).ids, clv: fin(b.clv) ? b.clv : null, profit: flat(b), season: b.season, beat: b.beat })), rule) : R.walkReasons(mine.map((b) => ({ t: settle(b), season: b.season, market: b.market, reasons: hold.get(b).ids, profit: flat(b), beat: b.beat })));
    mine.forEach((b, i) => {
      const h = hold.get(b);
      if (C) {
        const t = C.tierClv(h.ids, walk.at(i), b.kelly, rule);
        h.would = t.tier;
        h.proven = t.proven.map((id) => ({ id }));
        return;
      }
      const t = R.tierOf(h.ids, walk.at(b.at, b.market), b.kelly);
      h.would = t.tier;
      h.proven = t.proven;
    });
    const place = C && !rule.place ? { at: () => ({ love: true, lock: true }), final: { love: true, lock: true } } : R.placeTiers(mine.map((b) => ({ t: settle(b), tier: hold.get(b).would, profit: flat(b), beat: b.beat })));
    const counts = { lock: 0, high: 0, medium: 0, would: { lock: 0, high: 0, medium: 0 } };
    for (const b of mine) {
      const h = hold.get(b);
      let band = R.placed(h.would, place.at(b.at));
      if ((h.suspect || h.barred) && band !== 'medium') band = 'medium';
      const units = h.suspect || h.barred ? b.units : R.tierUnits(b.units, band);
      b.profit = b.units > 0 ? r2((b.profit * units) / b.units) : 0;
      b.units = units;
      b.band = band;
      if (h.proven.length) b.reasons = h.proven.map((p) => p.id);
      counts[band]++;
      counts.would[h.would]++;
    }
    flags.tiers = { ...counts, place: { love: place.final.love, lock: place.final.lock } };
    reasonsFile = C ? C.clvFileOf(sport, walk, rule, rule.place ? place : null, { at: new Date(now).toISOString(), epoch, version: R.REASONS_V }) : R.fileOf(sport, walk, place, { at: new Date(now).toISOString(), epoch });
    if (C) flags.tiers.rule = rule.name;
    // (the scratch dump for the round's tables: every bet with its band before and after)
    if (process.env.REPLAY_DUMP) {
      try {
        writeFileSync(path.join(process.env.REPLAY_DUMP, `${sport}-bets.json`), JSON.stringify(mine.map((b) => ({ t: b.t, at: b.at, season: b.season, market: b.market, stat: b.stat, odds: b.odds, kelly: b.kelly, p: b.p, res: b.res, timing: b.timing, hours: b.hours ?? null, window: b.window ?? null, id: b.id, side: b.side, fair: b.fair, clv: b.clv, beat: b.beat, ids: hold.get(b).ids, before: hold.get(b).before, would: hold.get(b).would, band: b.band, units: b.units, profit: b.profit }))));
        writeFileSync(path.join(process.env.REPLAY_DUMP, `${sport}-pass.json`), JSON.stringify(passes.filter((r) => !r.practice && (r.x.y === 0 || r.x.y === 1)).map((r) => ({ t: r.x.t, market: r.x.market, kind: r.x.kind, win: (r.x.y === 1) === r.sd.over ? 1 : 0, odds: r.sd.odds, beat: r.x.kind === 'o' ? fairBeatOf(r.x, r.sd.over, r.sd.odds, closes.get(r.x.key ?? r.x.id.replace(/:o$/, '')) ?? null) : null }))));
      } catch (err) {
        console.warn(`replay dump failed: ${err.message}`);
      }
    }
  }
  // (the two-band trial (DECISIONS.md D73, trusted.mjs): in a TRIAL sport, LIKE and LOVE only (LOCK off): a prop is a
  // LOVE where its proven pieces carry the month's share of its edge at a Kelly score in the month's range, both picked
  // from the bets settled before the month; with mid, the LIKE props' stake by their trusted share. The pieces'
  // reliability is walked by month on the props' close rows settled before (D72). A suspect or barred bet stays a LIKE
  // at its stake; D60's bar below holds the rest as before. The record guard: a trial sport's replay without the
  // props' pieces stops here rather than write a record without its bands)
  let trustedFile = null;
  const TR = sport !== 'mma' && V.trusted?.trialOn?.(sport) && process.env.REPLAY_TRIAL !== '0' ? V.trusted : null;
  if (TR && hold.size) {
    const rows = [...closes.values()].filter((x) => x.market === 'prop' && x.attr && (x.y === 0 || x.y === 1)).map((x) => [x.t, x.market, x.stat, x.f, x.y, x.attr]);
    const mine = bets.filter((b) => hold.has(b));
    if (!rows.length || !mine.some((b) => b.market === 'prop' && b.attr)) throw new Error(`${sport}: the two-band trial (D73) needs the props' pieces on the replay (gate.mjs propParts): none here`);
    const trust = TR.walkTrust(rows);
    const list = mine.map((b) => {
      const h = hold.get(b);
      const sh = b.market === 'prop' && b.attr ? TR.shareOf(b.attr, trust.at(b.at, 'prop')) : { share: 0, te: 0, pieces: [] };
      return { t: b.t, at: b.at, market: b.market, kelly: b.kelly, share: sh.share, te: sh.te, pieces: sh.pieces, units: b.units, held: !!(h.suspect || h.barred), res: b.res, odds: b.odds };
    });
    const tw = TR.trialWalk(list, sport, V.tuned?.knob ? { kelly: T('trialKelly', TR.TRIAL_OPTS?.kelly), loveUnits: T('loveUnits', TR.TRIAL_OPTS?.loveUnits) } : {});
    const counts = { lock: 0, high: 0, medium: 0 };
    mine.forEach((b, i) => {
      const { band, units } = TR.trialBand(list[i], tw.at(b.at), tw.opts);
      b.profit = b.units > 0 ? r2((b.profit * units) / b.units) : 0;
      b.units = units;
      b.band = band;
      if (band === 'high') b.trusted = list[i].pieces.slice(0, 3).map(([k]) => k);
      counts[band]++;
    });
    const fin1 = (r) => (r ? { ...r, kellyMax: fin(r.kellyMax) ? r.kellyMax : null } : null);
    flags.tiers = { ...(flags.tiers ?? {}), ...counts, rule: 'trial', trial: { love: fin1(tw.final.love), mid: tw.final.mid, months: tw.months.filter(([, c]) => c.love).length, of: tw.months.length } };
    trustedFile = TR.trialFileOf(sport, trust, tw, { at: new Date(now).toISOString(), epoch, record: { love: counts.high, like: counts.medium } });
  }
  if (process.env.REPLAY_ATTR !== '1') for (const b of bets) if (b.attr) (delete b.attr, delete b.lam);
  // (MMA's Kelly bands earn their place (DECISIONS.md D65): D58's place check on the bands MMA bets by (D37's Kelly
  // bands): LOVE shows only where the LOVEs and LOCKs before that month beat the LIKEs by flat return and beat-the-close
  // on PLACE_MIN of them, LOCK only where its own beat the LOVEs; a band not earned falls to the one below, its stake
  // held to that band's cap (TIER_UNITS). MMA_PLACE=0 off; a version without reasons.mjs: none)
  const mmaBefore = new Map();
  if (sport === 'mma' && REASONS?.placeTiers && process.env.MMA_PLACE !== '0') {
    const flatOfBet = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);
    const mine = bets.filter((b) => !b.practice);
    const place = REASONS.placeTiers(mine.map((b) => ({ t: b.t + GAME_HOURS * 36e5, tier: b.band, profit: flatOfBet(b), beat: b.beat })));
    let moved = 0;
    for (const b of mine) mmaBefore.set(b, { band: b.band, units: b.units, profit: b.profit });
    for (const b of mine) {
      const band = REASONS.placed(b.band, place.at(b.at));
      if (band === b.band) continue;
      const units = REASONS.tierUnits(b.units, band);
      b.profit = b.units > 0 ? r2((b.profit * units) / b.units) : 0;
      b.units = units;
      b.band = band;
      moved++;
    }
    flags.mmaPlace = { love: place.final.love, lock: place.final.lock, would: place.final.would, moved };
  }
  // (the slate's practice picks: each game's quota (PRACTICE_N over the ET day's games, at least one) less its bets
  // that clear the vig, from its PASS rows with an edge before the vig, best first, at the practice stake)
  // (the beat-the-close bar (DECISIONS.md D60, Gemini's guard): a market (a line's market, a prop's stat) stakes more
  // than the practice stake only while the bets placed before it, settled by its moment, beat the fair close at
  // least V.desk.BEAT_BAR of the time over their last LINE_GATE_N with a close, from LINE_GATE_MIN of them; under it
  // the practice stake and a LIKE at most: shrunk, never off (D1). A version without the bar: none)
  const BAR = fin(V.desk.BEAT_BAR) ? T('beatBar', V.desk.BEAT_BAR) : null;
  const BAR_MIN_N = T('beatMin', V.desk.LINE_GATE_MIN ?? 40);
  if (fin(BAR)) beatBar(bets, { bar: BAR, min: BAR_MIN_N, window: V.desk.LINE_GATE_N ?? 200, practiceUnits, flags });
  // (the Bot's own consistent losers (DECISIONS.md D79, desk.mjs ownVerdict): a key (a prop's stat and side, a line's
  // market and side) whose own bets settled before the moment lost past the shrunk bar stakes the practice stake and
  // a LIKE at most, after every other rule; still bet and still counted, so it can earn its stake back. A version
  // without it, or a sport it isn't on in: none)
  const ownO = V.desk.ownOpts?.(sport);
  if (V.desk.ownVerdict && V.desk.ownBarOn?.(sport)) ownBar(bets, { verdict: ownO ? (n, sum) => V.desk.ownVerdict(n, sum, ownO) : V.desk.ownVerdict, key: V.desk.ownKey, practiceUnits, flags });
  // (D88's mmaOpenFav: MMA's favorites placed at the open staked by the knob: 0 as the rules left them, 1 the desk's full
  // Kelly stake (desk.mjs stakeFor, the bands' place cap aside; a suspect or practice bet as it is), 2 the practice stake)
  if (sport === 'mma') {
    const mode = T('mmaOpenFav', 0);
    const f = { mode, bets: 0, before: 0, after: 0 };
    for (const b of bets) {
      if (b.market !== 'ml' || b.timing !== 'open' || !(b.fair >= 0.5) || b.practice || hold.get(b)?.suspect) continue;
      f.bets++;
      f.before = r2(f.before + b.profit);
      if (mode === 1 || mode === 2) {
        const ev = b.p * dec(b.odds) - 1;
        const units = mode === 2 ? practiceUnits : Math.max(practiceUnits, V.desk.stakeFor(ev, evScale, b.odds));
        if (fin(units) && units !== b.units) {
          b.profit = b.units > 0 ? r2((b.profit * units) / b.units) : 0;
          b.units = units;
          if (mode === 2) b.band = 'medium';
        }
      }
      f.after = r2(f.after + b.profit);
    }
    flags.mmaOpenFav = f;
  }
  const gamesOn = new Map();
  const everyRow = [...bets.map((b) => ({ day: etDay(b.t), event: b.event })), ...passes.map((r) => ({ day: etDay(r.x.t), event: String(r.x.event) }))];
  for (const r of everyRow) (gamesOn.get(r.day) ?? gamesOn.set(r.day, new Set()).get(r.day)).add(r.event);
  const betOn = new Map();
  for (const b of bets) betOn.set(b.event, (betOn.get(b.event) ?? 0) + 1);
  const passBy = new Map();
  for (const r of passes) (passBy.get(String(r.x.event)) ?? passBy.set(String(r.x.event), []).get(String(r.x.event))).push(r);
  // (picked whatever PRACTICE_STAKED (D87); while it's off (D57) they're tracked: kept apart (tracked), never among the
  // bets (the record, the bands, the bars, the strip), tallied as if bet at the practice stake (summarize's practice))
  const staked = V.desk.PRACTICE_STAKED !== false;
  const tracked = [];
  for (const [event, rs] of passBy) {
    const quota = V.desk.slateQuota(practiceN, gamesOn.get(etDay(rs[0].x.t))?.size ?? 1);
    const need = Math.max(0, quota - (betOn.get(event) ?? 0));
    const picked = rs.filter((r) => r.sd.edge > 0 && !r.marginHeld).sort((a, b) => b.sd.edge - a.sd.edge).slice(0, need);
    for (const r of picked) {
      r.practice = true;
      (staked ? bets : tracked).push(betOf(r.x, r.sd, { units: practiceUnits, band: 'medium', practice: true, timing: r.x.kind === 'o' ? 'open' : 'close', fb: r.x.kind === 'o' ? fairBeatOf(r.x, r.sd.over, r.sd.odds, closes.get(r.x.key ?? r.x.id.replace(/:o$/, '')) ?? null) : null, names, survival: 1 }));
    }
  }
  bets.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const passed = passes.filter((r) => !r.practice);
  const sumArgs = { epoch, now, flags, tracked, rows: { open: opens.size, close: closes.size }, seasonsWithProps: new Set([...opens.values(), ...closes.values()].filter((x) => x.market === 'prop').map((x) => x.season)), seasonsAll: new Set([...opens.values(), ...closes.values()].map((x) => x.season)) };
  // (the band lab's dump (band-lab.mjs): every bet as placed before the bands, its reasons and holds, the passes in
  // brief and the summary's arguments, so a band rule can be tried on the whole replay without a refit)
  if (process.env.REPLAY_DUMP) {
    try {
      const lab = bets.map((b) => {
        const h = hold.get(b);
        const m = mmaBefore.get(b);
        return { ...b, lab: h ? { ids: h.ids ?? [], before: h.before ?? null, suspect: !!h.suspect, barred: !!h.barred, would: h.would ?? null } : m ? { ids: [], before: m, suspect: false, barred: false, would: null } : null };
      });
      // (research only (REPLAY_ATTR, D72): every close row's pieces on the over's (or home's) side, its fair and result:
      // what the band lab's reliability is fit on, walk-forward)
      if (process.env.REPLAY_ATTR === '1') {
        const att = [...closes.values()].filter((x) => x.attr && (x.y === 0 || x.y === 1)).map((x) => [x.t, x.market, x.stat, r4(x.f), x.y, Object.fromEntries(Object.entries(x.attr).filter(([, v]) => Math.abs(v) >= 1e-5).map(([k, v]) => [k, Math.round(v * 1e5) / 1e5])), x.overOdds, x.underOdds, x.key ?? x.id.replace(/:c$/, ''), x.season, knownAt(x) ? 1 : 0]);
        writeFileSync(path.join(process.env.REPLAY_DUMP, `${sport}-attr.json`), JSON.stringify(att));
      }
      writeFileSync(path.join(process.env.REPLAY_DUMP, `${sport}-lab.json`), JSON.stringify({ v: 1, sport, at: new Date(now).toISOString(), practiceUnits, beatBar: fin(BAR) ? { bar: BAR, min: BAR_MIN_N, window: V.desk.LINE_GATE_N ?? 200 } : null, bets: lab, passed: passed.map((r) => [r.x.y ?? null, r.sd.over ? 1 : 0, r.sd.odds]), args: { ...sumArgs, seasonsWithProps: [...sumArgs.seasonsWithProps], seasonsAll: [...sumArgs.seasonsAll] } }));
    } catch (err) {
      console.warn(`replay lab dump failed: ${err.message}`);
    }
  }
  const out = summarize(sport, bets, passed, sumArgs);
  // (D93: the replay's expectation by key, what the live check reads the live bets against (live-check.mjs))
  out.expect = expectOf(bets);
  // (the self-tune's day series (D88, self-tune.mjs seriesOf): the bets themselves, off the JSON)
  Object.defineProperty(out, 'bets', { value: bets, enumerable: false });
  // (the reason tiers' file (D58): what gate.mjs --record writes as reasons.json, kept off the replay's own file)
  if (reasonsFile) out.reasonsFile = reasonsFile;
  // (the two-band trial's file (D73): what gate.mjs --record writes as trusted.json)
  if (trustedFile) out.trustedFile = trustedFile;
  return out;
}

// The beat-the-close bar's walk (D60): each bet (practice picks aside) in placement order, its market's earlier bets
// settled by its moment (start plus GAME_HOURS) with a fair-close check; held to the practice stake (units, profit
// scaled, band a LIKE) where they number min or more and beat the close under bar of the time over the last window.
// flags.beatBar: { bar, held, markets: { key: { n, beat } } } (every bet with a check, the end's)
export const beatKey = (b) => (b.market === 'prop' ? `prop:${b.stat}` : b.market);
export function beatBar(bets, { bar, min = 40, window = 200, practiceUnits = 0.5, flags = {} }) {
  const settle = (b) => b.t + GAME_HOURS * 36e5;
  const by = new Map();
  for (const b of bets) if (!b.practice && (b.beat === 0 || b.beat === 1)) (by.get(beatKey(b)) ?? by.set(beatKey(b), []).get(beatKey(b))).push(b);
  const lists = new Map();
  for (const [k, list] of by) {
    const sorted = [...list].sort((a, b) => settle(a) - settle(b));
    const pre = [0];
    for (const b of sorted) pre.push(pre[pre.length - 1] + b.beat);
    lists.set(k, { s: sorted.map(settle), pre });
  }
  const out = { bar, held: 0, markets: {} };
  for (const b of bets) {
    if (b.practice) continue;
    const l = lists.get(beatKey(b));
    if (!l) continue;
    let lo = 0;
    let hi = l.s.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (l.s[mid] < b.at) lo = mid + 1;
      else hi = mid;
    }
    const n = Math.min(window, lo);
    if (n < min) continue;
    const share = (l.pre[lo] - l.pre[lo - n]) / n;
    if (share >= bar) continue;
    if (b.units > practiceUnits) {
      b.profit = b.units > 0 ? r2((b.profit * practiceUnits) / b.units) : 0;
      b.units = practiceUnits;
    }
    b.band = 'medium';
    b.beatHeld = r4(share);
    out.held++;
  }
  for (const [k, l] of lists) {
    const n = Math.min(window, l.s.length);
    out.markets[k] = { n, beat: n ? r4((l.pre[l.s.length] - l.pre[l.s.length - n]) / n) : null };
  }
  flags.beatBar = out;
  return out;
}

// The Bot's own record's walk (D79): each bet (practice picks aside) in placement order, its key's earlier bets settled
// by its moment (start plus GAME_HOURS), flat at their own price; held to the practice stake (units, profit scaled, a
// LIKE) where verdict(n, sum).held. flags.ownBar: { held, before, after, keys: { key: { n, sum } } } (the end's: what
// gate.mjs --record writes to own-bar.json)
export function ownBar(bets, { verdict, key, practiceUnits = 0.5, flags = {} }) {
  const settle = (b) => b.t + GAME_HOURS * 36e5;
  const flat = (b) => (b.res === 'W' ? dec(b.odds) - 1 : b.res === 'L' ? -1 : 0);
  const mine = bets.filter((b) => !b.practice && (b.res === 'W' || b.res === 'L' || b.res === 'P') && fin(b.odds));
  const bySettle = [...mine].sort((a, b) => settle(a) - settle(b));
  const atOf = (b) => (fin(b.at) ? b.at : b.t);
  const byAt = [...mine].sort((a, b) => atOf(a) - atOf(b));
  const acc = new Map();
  const add = (m, x) => {
    const k = key(x.market, x.stat, x.side);
    const a = m.get(k) ?? { n: 0, sum: 0 };
    a.n++;
    a.sum += flat(x);
    m.set(k, a);
  };
  const out = { held: 0, before: 0, after: 0, keys: {} };
  let j = 0;
  for (const b of byAt) {
    while (j < bySettle.length && settle(bySettle[j]) < atOf(b)) add(acc, bySettle[j++]);
    const a = acc.get(key(b.market, b.stat, b.side));
    if (!a || !verdict(a.n, a.sum).held) continue;
    b.ownHeld = r4(a.sum / a.n);
    b.band = 'medium';
    out.held++;
    if (b.units > practiceUnits) {
      const profit = b.units > 0 ? r2((b.profit * practiceUnits) / b.units) : 0;
      out.before = r2(out.before + b.profit);
      out.after = r2(out.after + profit);
      b.profit = profit;
      b.units = practiceUnits;
    }
  }
  const end = new Map();
  for (const x of mine) add(end, x);
  for (const [k, a] of [...end].sort((p, q) => (p[0] < q[0] ? -1 : 1))) out.keys[k] = { n: a.n, sum: r2(a.sum) };
  flags.ownBar = out;
  return out;
}

function betOf(x, sd, { units, band, practice, timing, fb = null, names, survival, noAttr = false }) {
  if (noAttr) x = { ...x, attr: null };
  const res = x.y === null || x.y === undefined ? 'P' : (x.y === 1) === sd.over ? 'W' : 'L';
  // (research only (REPLAY_ATTR, D72): the row's pieces of the edge on the bet's own side)
  // (and the two-band trial's props (D73): their pieces, which gate.mjs computes in a trial sport)
  if (x.attr) {
    const s = sd.over ? 1 : -1;
    const attr = Object.fromEntries(Object.entries(x.attr).map(([k, v]) => [k, Math.round(s * v * 1e5) / 1e5]));
    return { ...betOf(x, sd, { units, band, practice, timing, fb, names, survival, noAttr: true }), attr, lam: r4(x.lam) };
  }
  const profit = res === 'W' ? r2(units * (dec(sd.odds) - 1)) : res === 'L' ? -units : 0;
  const w = wordsOf(x, sd.over, names);
  return { factsAt: fin(x.factsAt) ? x.factsAt : null, id: x.key ?? x.id, event: String(x.event), sport: x.sport, season: x.season, market: x.market, stat: x.stat, line: x.line ?? null, side: sd.over ? (x.market === 'prop' || x.market === 'total' ? 'over' : 'home') : x.market === 'prop' || x.market === 'total' ? 'under' : 'away', pick: w.pick, matchup: w.matchup, player: w.player, odds: sd.odds, ...(sd.book ? { book: sd.book } : {}), p: r4(sd.pS), fair: r4(sd.fS), kelly: r4(sd.kelly), band, practice, units, res, profit, timing, beat: fb ? fb.beat : null, clv: fb ? fb.clv : null, survival: r4(survival), t: x.t, at: fin(x.at) ? x.at : timing === 'open' ? x.t - 24 * 36e5 : x.t - 36e5 };
}

// The file's content from the replayed bets (practice picks among them, flagged) and the rows that passed
export function summarize(sport, bets, passed, { epoch, now, flags, rows, seasonsWithProps, seasonsAll, tracked = [] }) {
  const real = bets.filter((b) => !b.practice);
  // (the practice picks: staked ones (PRACTICE_STAKED on), else the tracked candidates as if bet at the practice stake (D87))
  const practice = [...bets.filter((b) => b.practice), ...tracked];
  // (the passes as day rows at a flat unit on the Bot's side (the pass tally's), for the time range's PASS row)
  const passRows = passed.map((r) => ({ t: r.x.t, band: 'pass', res: r.x.y === null || r.x.y === undefined ? 'P' : (r.x.y === 1) === r.sd.over ? 'W' : 'L', units: 1, profit: r.x.y === null || r.x.y === undefined ? 0 : (r.x.y === 1) === r.sd.over ? r2(dec(r.sd.odds) - 1) : -1, fair: r.sd.fS, beat: null }));
  const years = {};
  for (const y of new Set(bets.map((b) => yearOf(b.t)))) {
    const mine = real.filter((b) => yearOf(b.t) === y);
    years[y] = { all: tallyOf(mine), practice: tallyOf(practice.filter((b) => yearOf(b.t) === y)), byBand: Object.fromEntries(BANDS.map((bd) => [bd, tallyOf(mine.filter((b) => b.band === bd))])), lines: tallyOf(mine.filter(isLine)), props: tallyOf(mine.filter((b) => !isLine(b))) };
  }
  const seasons = [...new Set(bets.map((b) => b.season))].sort((a, b) => a - b).map((s) => {
    const mine = real.filter((b) => b.season === s);
    return { season: s, context: seasonsWithProps.has(s) ? 'full' : 'ratings', ...tallyOf(mine), practice: tallyOf(practice.filter((b) => b.season === s)), lines: tallyOf(mine.filter(isLine)), props: tallyOf(mine.filter((b) => !isLine(b))) };
  });
  // (the last REPLAY_DAYS Eastern days' tallies in the Recent form card's shape, [won, lost, push, staked, profit];
  // the streak over the decided bets, newest first, with its settled times; the last REPLAY_LAST bets)
  const settledAt = (b) => b.t + GAME_HOURS * 36e5;
  const newest = bets.length ? maxOf(bets.map(settledAt)) : now;
  const window = new Set(Array.from({ length: REPLAY_DAYS }, (_, i) => etDay(newest - i * 864e5)));
  const daysOf = (list) => {
    const days = {};
    for (const b of list) {
      const day = etDay(settledAt(b));
      if (!window.has(day)) continue;
      const d = (days[day] ??= [0, 0, 0, 0, 0]);
      d[b.res === 'W' ? 0 : b.res === 'L' ? 1 : 2]++;
      d[3] = r2(d[3] + b.units);
      d[4] = r2(d[4] + b.profit);
    }
    return days;
  };
  const order = (a, b) => settledAt(b) - settledAt(a) || b.t - a.t || a.id.localeCompare(b.id);
  const graded = [...real].sort(order);
  const decided = graded.filter((b) => b.res !== 'P');
  let n = 0;
  while (n < decided.length && decided[n].res === decided[0].res) n++;
  const entry = (b) => ({ id: b.id, sport: b.sport, season: b.season, pick: b.pick, matchup: b.matchup, market: WALLET_MARKET[b.market] ?? b.market, player: b.player, stat: b.stat, line: b.line, side: b.side, odds: b.odds, ...(b.book ? { book: b.book } : {}), p: b.p, fair: b.fair, kelly: b.kelly, band: b.band, practice: b.practice, units: b.units, res: b.res, profit: b.profit, timing: b.timing, beat: b.beat, clv: b.clv ?? null, survival: b.survival, at: new Date(b.at).toISOString(), factsAt: fin(b.factsAt) ? new Date(b.factsAt).toISOString() : null, start: new Date(b.t).toISOString(), settled: new Date(settledAt(b)).toISOString() });
  const all = tallyOf(real);
  return {
    v: REPLAY_V,
    sport,
    epoch,
    at: new Date(now).toISOString(),
    from: bets.length ? new Date(minOf(bets.map((b) => b.t))).toISOString() : null,
    through: bets.length ? new Date(maxOf(bets.map((b) => b.t))).toISOString() : null,
    n: { rows: rows.open + rows.close, keys: real.length + practice.length + passed.length, bets: real.length, practice: practice.length, pass: passed.length },
    overall: all,
    practice: tallyOf(practice),
    // (the rows it wouldn't bet, at a flat unit on the Bot's side: context, never the record)
    pass: finishTally(passed.reduce((t, r) => addBet(t, { res: r.x.y === null || r.x.y === undefined ? 'P' : (r.x.y === 1) === r.sd.over ? 'W' : 'L', units: 1, profit: r.x.y === null || r.x.y === undefined ? 0 : (r.x.y === 1) === r.sd.over ? r2(dec(r.sd.odds) - 1) : -1, fair: r.sd.fS, beat: null, clv: null }), emptyTally())),
    byBand: Object.fromEntries(BANDS.map((bd) => [bd, tallyOf(real.filter((b) => b.band === bd))])),
    byMarket: { lines: tallyOf(real.filter(isLine)), props: tallyOf(real.filter((b) => !isLine(b))) },
    bySeason: seasons,
    byYear: years,
    days: daysOf(real),
    practiceDays: daysOf(practice),
    // (every day's buckets by band, the Algorithm tab's range (the owner, 2026-10-19): dailyOf)
    daily: dailyOf(bets, settledAt, [...tracked, ...passRows]),
    streak: decided.length ? `${decided[0].res}${n}` : null,
    streakAt: decided.slice(0, Math.min(n, STREAK_CAP)).map((b) => new Date(settledAt(b)).toISOString()),
    brokeAt: decided[n] ? new Date(settledAt(decided[n])).toISOString() : null,
    last: [...bets].sort(order).slice(0, REPLAY_LAST).map(entry),
    flags: {
      timing: { open: flags.open, close: flags.close, openSeen: flags.openSeen, openClean: flags.openClean, openInWindow: flags.openInWindow, barred: flags.barred ?? 0, ...(flags.lagHeld ? { lagHeld: flags.lagHeld } : {}) },
      // (the bar's own place (D51): whether it stakes the lines, by season and for what comes next)
      ...(flags.bar ? { bar: flags.bar } : {}),
      // (the betting windows (D63): each line segment's policy on the whole history (what --record writes as
      // windows.json for the live desk) and the placements by policy and kind)
      ...(flags.windows ? { windows: flags.windows } : {}),
      // (the props' stat bar (D64) and MMA's bands' place (D65))
      ...(flags.propBar ? { propBar: { ...flags.propBar, barred: flags.propsBarred ?? 0 } } : {}),
      ...(flags.mmaPlace ? { mmaPlace: flags.mmaPlace } : {}),
      // (D76, the shopped-price guard: the shop-only bets, those under the month's minimum, their flat units, the
      // units before and after the shrink where it applies, and next, the T the live desk reads ('dk': clear there too))
      ...(flags.shopGuard ? { shopGuard: flags.shopGuard } : {}),
      // (D79, the Bot's own consistent losers: the bets held, their units before and after, each key's record (own-bar.json))
      ...(flags.ownBar ? { ownBar: flags.ownBar } : {}),
      ...(flags.margin ? { margin: flags.margin } : {}),
      ...(flags.mmaOpenFav ? { mmaOpenFav: flags.mmaOpenFav } : {}),
      ...(flags.leanGuard ? { leanGuard: flags.leanGuard } : {}),
      // (the reason tiers (D58): the bets by band and by would-be band, and whether LOVE and LOCK have earned their place)
      ...(flags.tiers ? { tiers: flags.tiers } : {}),
      // (D48, no look-ahead by timestamp: the bets with a factsAt stamp, those past their placement (0), the opens held
      // to the close and the closes left unbet because their price read a fact posted after them)
      facts: { stamped: bets.filter((b) => fin(b.factsAt)).length, late: lateFacts(bets).length, openHeld: flags.openHeld ?? 0, closeHeld: flags.closeHeld ?? 0 },
      // (MMA's bouts are priced by the fights model whole: every season full)
      context: sport === 'mma' ? { full: [...seasonsAll].sort(), ratingsOnly: [] } : { full: [...seasonsAll].filter((s) => seasonsWithProps.has(s)).sort(), ratingsOnly: [...seasonsAll].filter((s) => !seasonsWithProps.has(s)).sort() },
      price: PRICE_NOTE,
      // (D74: the bets placed where the deep history had the other US books at the snapshot (shopped), those at a better
      // price than DraftKings' (better), and the rest at DraftKings' alone)
      shop: { shopped: bets.filter((b) => b.book).length, better: bets.filter((b) => b.book && b.book !== 'dk').length, dk: bets.filter((b) => !b.book).length },
      placement: sport === 'mma' ? MMA_PLACEMENT_NOTE : PLACEMENT_NOTE,
      split: 'games that start before the epoch replayed; the live ledger from the epoch on',
      notSeen: "the live desk's CLV gates, CHECKs, research and news",
    },
  };
}

// The replayed bets of the newest year in buckets by the Eastern day each settled and its band (lock, high, medium; a
// practice pick practice): "won,lost,push,staked,profit,beat the fair close,with a close at the line,their summed expected return at the fair close" (D56), trailing zeros dropped. The
// Algorithm tab's time range (the owner, 2026-10-19: Today to This year over the merged history, D47) sums the days in
// a range without the bets; All time reads the whole file's tallies, so the buckets start at the newest bet's year (a
// week before it, for a week across the turn of the year) and the file stays small
// (vig: the profit less the fair-price profit of the day's bets with a fair chance (fairProfitOf), the Vig column's)
export const DAILY_COLS = ['won', 'lost', 'push', 'staked', 'profit', 'beat', 'beatN', 'clv', 'vig'];
export function dailyOf(bets, settledAt = (b) => b.t + GAME_HOURS * 36e5, extra = []) {
  if (!bets.length) return { cols: DAILY_COLS, from: null, bands: {} };
  const year = Number(etDay(maxOf(bets.map(settledAt))).slice(0, 4));
  const from = etDay(Date.UTC(year, 0, 1, 12) - 7 * 864e5);
  const bands = {};
  // (extra: the tracked practice candidates (band 'practice') and the passes (band 'pass'), D87: buckets of their
  // own, never the bets' year or bands)
  for (const b of [...bets, ...extra]) {
    const day = etDay(settledAt(b));
    if (day < from) continue;
    const band = b.band === 'pass' ? 'pass' : b.practice ? 'practice' : b.band;
    const d = ((bands[band] ??= {})[day] ??= [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    d[b.res === 'W' ? 0 : b.res === 'L' ? 1 : 2]++;
    d[3] = r2(d[3] + b.units);
    d[4] = r2(d[4] + b.profit);
    if (b.beat === 1 || b.beat === 0) {
      d[5] += b.beat;
      d[6]++;
      d[7] = r4(d[7] + (fin(b.clv) ? b.clv : 0));
    }
    const fp = fairProfitOf(b);
    if (fp !== null) d[8] = r4(d[8] + b.profit - fp);
  }
  const text = (d) => {
    let n = d.length;
    while (n > 0 && d[n - 1] === 0) n--;
    return d.slice(0, n).join(',');
  };
  const sortKeys = (o, f) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, f(o[k])]));
  return { cols: DAILY_COLS, from, bands: sortKeys(bands, (days) => sortKeys(days, text)) };
}

// The caveat in one line, for the pages
export function caveatOf(r) {
  if (!r) return null;
  const t = r.flags?.timing ?? {};
  const ctx = r.flags?.context ?? {};
  const seasons = (list) => (list?.length ? `${list[0]}${list.length > 1 ? `–${list[list.length - 1]}` : ''}` : null);
  const parts = [`Today's Bot replayed on every priced game before its latest version: ${t.open ?? 0} bets at a clean open where its edge survived the lineup risk, ${t.close ?? 0} at the close`];
  if (r.sport === 'mma' && ctx.full?.length) parts.push(`the fights model ${seasons(ctx.full)}`);
  else if (ctx.full?.length) parts.push(`full context (props and lines) ${seasons(ctx.full)}${ctx.ratingsOnly?.length ? `, lines by the ratings alone ${seasons(ctx.ratingsOnly)}` : ''}`);
  // (D74: the bets at the best US price where the history has every book at the bet's snapshot)
  const shop = r.flags?.shop;
  parts.push(`${shop?.shopped ? `the best US price where the history has every book at that moment (${shop.shopped} of ${(t.open ?? 0) + (t.close ?? 0)} bets), else the Book's own` : "the Book's price nearest the placement"}; the live desk's gates, CHECKs and research can't be replayed`);
  return `${parts.join('; ')}.`;
}

// ---- the merge with the live ledger (picks.mjs) ----

// (a page tally from a replay tally and the live bets' record (desk.mjs record's shape))
const pageTally = (t) => ({ wins: t?.won ?? 0, losses: t?.lost ?? 0, pushes: t?.push ?? 0, winPct: (t?.won ?? 0) + (t?.lost ?? 0) ? r4((t?.won ?? 0) / ((t?.won ?? 0) + (t?.lost ?? 0))) : null, profit: r2(t?.profit ?? 0), staked: r2(t?.staked ?? 0), roi: t?.staked ? r4((t.profit ?? 0) / t.staked) : null });
const sumTally = (a, b) => ({ won: (a?.won ?? 0) + (b?.won ?? 0), lost: (a?.lost ?? 0) + (b?.lost ?? 0), push: (a?.push ?? 0) + (b?.push ?? 0), staked: r2((a?.staked ?? 0) + (b?.staked ?? 0)), profit: r2((a?.profit ?? 0) + (b?.profit ?? 0)) });

// (a live bet on the live side of the split: its game starts at or after the epoch; with no replay file every bet)
export const liveSince = (b, epoch) => !epoch || !(Date.parse(b.start) < Date.parse(epoch));

// The picks.json record block: the replay's part (the games before the epoch) plus the live ledger's bets since it,
// overall, by band (lock, high, medium; low the live ledger's own older action bets), the practice line, this
// calendar year's (the band headers' "This year"), and each part alone with the replay's flags. record(list,
// opts) is desk.mjs record; levelOf(b) a live bet's published band; practiceOf(bets) its practice record
export function mergeRecord(replay, published, { epoch, now = Date.now(), record, levelOf = (b) => b.publishedLevel, practiceOf = null } = {}) {
  const live = replay ? published.filter((b) => liveSince(b, replay.epoch ?? epoch)) : published;
  const year = yearOf(now);
  const liveYear = live.filter((b) => yearOf(Date.parse(b.start)) === year);
  const bands = ['lock', 'high', 'medium', 'low'];
  const byLevelOf = (bets, rp) => Object.fromEntries(bands.map((l) => [l, pageTally(sumTally(record(bets.filter((b) => levelOf(b) === l)), rp?.byBand?.[l]))]));
  const ry = replay?.byYear?.[year] ?? null;
  const livePractice = practiceOf ? practiceOf(live) : null;
  const livePracticeYear = practiceOf ? practiceOf(liveYear) : null;
  return {
    graded: published.filter((b) => b.status !== 'open').length,
    overall: pageTally(sumTally(record(live), replay?.overall)),
    byLevel: byLevelOf(live, replay),
    ...(livePractice || replay ? { practice: pageTally(sumTally(livePractice, replay?.practice)) } : {}),
    byMarket: { lines: pageTally(sumTally(record(live.filter((b) => b.market !== 'prop')), replay?.byMarket?.lines)), props: pageTally(sumTally(record(live.filter((b) => b.market === 'prop')), replay?.byMarket?.props)) },
    year: { year: Number(year), overall: pageTally(sumTally(record(liveYear), ry?.all)), byLevel: byLevelOf(liveYear, { byBand: ry?.byBand }), ...(livePracticeYear || ry ? { practice: pageTally(sumTally(livePracticeYear, ry?.practice)) } : {}) },
    live: { from: replay?.epoch ?? epoch ?? null, overall: pageTally(record(live)), byLevel: Object.fromEntries(bands.map((l) => [l, pageTally(record(live.filter((b) => levelOf(b) === l)))])), ...(livePractice ? { practice: pageTally(livePractice) } : {}) },
    replay: replay ? { at: replay.at, epoch: replay.epoch, commit: replay.commit ?? null, from: replay.from, through: replay.through, n: replay.n, overall: pageTally(replay.overall), practice: pageTally(replay.practice), flags: replay.flags } : null,
    caveat: caveatOf(replay),
  };
}

// The picks.json recent block merged: the live block (picks.mjs recentOf over the live side of the split) joined to
// the replay's days, streak and last bets; the replay's newest bets fill the last five where the live ledger has
// fewer, the streak counted on into the replay's run where the live run reaches the end of the live bets
export function mergeRecent(replay, live, { now = Date.now(), days = 7, last = 5 } = {}) {
  if (!replay) return live;
  const t = typeof now === 'number' ? now : now.getTime();
  const window = new Set(Array.from({ length: days }, (_, i) => etDay(t - i * 864e5)));
  const out = { ...live, days: { ...(live.days ?? {}) } };
  const week = { ...(live.week ?? { won: 0, lost: 0, push: 0, profit: 0 }) };
  for (const [day, d] of Object.entries(replay.days ?? {})) {
    if (!window.has(day)) continue;
    const m = (out.days[day] ??= [0, 0, 0, 0, 0]);
    for (let i = 0; i < 5; i++) m[i] = r2((m[i] ?? 0) + (d[i] ?? 0));
    week.won += d[0];
    week.lost += d[1];
    week.push += d[2];
    week.profit = r2(week.profit + d[4]);
  }
  out.week = week;
  const practice = { ...(live.practice ?? { won: 0, lost: 0, push: 0, profit: 0 }) };
  for (const [day, d] of Object.entries(replay.practiceDays ?? {})) {
    if (!window.has(day)) continue;
    practice.won += d[0];
    practice.lost += d[1];
    practice.push += d[2];
    practice.profit = r2(practice.profit + d[4]);
  }
  if (practice.won + practice.lost + practice.push) out.practice = practice;
  else delete out.practice;
  // (the replay's last bets as the live block lists its own, apart from its practice picks (their own line))
  const replayLast = (replay.last ?? []).filter((b) => !b.practice).map((b) => ({ sport: b.sport, pick: b.pick, matchup: b.matchup, market: b.market, player: b.player, res: b.res, units: b.profit, at: b.settled, replayed: true }));
  const merged = [...(live.last ?? []), ...replayLast].sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(a.pick).localeCompare(String(b.pick)));
  out.last = merged.slice(0, last);
  // (the streak: the live run first (its settled times), then the replay's run where the live one reaches the end
  // of the live bets and the replay's newest decided bet agrees)
  const liveRun = live.streak ? live.streak[0] : null;
  const liveN = live.streak ? Number(live.streak.slice(1)) : 0;
  const liveAll = !!live.streak && live.brokeAt === null;
  if (!live.streak || liveAll) {
    const rr = replay.streak ? replay.streak[0] : null;
    if (rr && (!liveRun || liveRun === rr)) {
      const rn = Number(replay.streak.slice(1));
      out.streak = `${rr}${liveN + rn}`;
      out.streakAt = [...(live.streakAt ?? []), ...(replay.streakAt ?? [])].slice(0, STREAK_CAP);
      out.brokeAt = replay.brokeAt ?? null;
    } else if (rr && liveRun && liveRun !== rr) {
      out.brokeAt = replay.streakAt?.[0] ?? live.brokeAt ?? null;
    }
  }
  return out;
}

// The sport's replay file as the desk reads it (apps/<sport>/src/StaticData/model/replay-record.json); null with
// none or one it can't read
export function readReplay(root, sport) {
  const file = path.join(root, 'apps', sport, 'src/StaticData/model/replay-record.json');
  if (!existsSync(file)) return null;
  try {
    const r = JSON.parse(readFileSync(file, 'utf8'));
    return r && r.v === REPLAY_V && r.sport === sport ? r : null;
  } catch {
    return null;
  }
}
