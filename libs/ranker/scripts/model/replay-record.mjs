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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const REPLAY_V = 1;
export const REPLAY_LAST = 20;
export const REPLAY_DAYS = 14;
const STREAK_CAP = 60;
// (a replayed game's settled time: its start plus a game's length)
export const GAME_HOURS = 3;
// (a clean open: seen after both sides' previous game ended, that game's start plus this)
const PREV_GAME_HOURS = 4;
export const PRICE_NOTE = "the Book's price nearest the placement (the archive's open or close), never a shopped price";
export const PLACEMENT_NOTE = 'a clean open inside the window where the edge held to the lineup risk clears the price, else the close';
// (MMA, D37: the Bot bets a bout at the archive's first sighting where its lead band's price clears, two weeks or more
// out on a soft opening line; the paper edge there is largest where real money is hardest to get down)
export const MMA_PLACEMENT_NOTE = "the archive's first sighting of the bout where the lead band's trusted price clears (D37: a soft opening line two weeks or more out, where real money is hardest to get down), else the close";

const fin = Number.isFinite;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const impl = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));
const yearOf = (t) => etDay(t).slice(0, 4);
const LINES = new Set(['ml', 'spread', 'total']);
const isLine = (x) => LINES.has(x.market);
const WALLET_MARKET = { ml: 'moneyline', prop: 'prop', spread: 'spread', total: 'total' };
const BANDS = ['lock', 'high', 'medium'];

// A tally: the bets graded, won, lost, pushed, the units staked and won, the return, and how many beat the close
// (the bets placed at an open with a close to read)
export const emptyTally = () => ({ bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0, roi: null, beat: 0, beatN: 0 });
export function addBet(t, b) {
  t.bets++;
  t[b.res === 'W' ? 'won' : b.res === 'L' ? 'lost' : 'push']++;
  t.staked = r2(t.staked + b.units);
  t.profit = r2(t.profit + b.profit);
  t.roi = t.staked ? r4(t.profit / t.staked) : null;
  if (b.beat === 1 || b.beat === 0) {
    t.beatN++;
    t.beat += b.beat;
  }
  return t;
}
const finishTally = (t) => ({ ...t, beat: t.beatN ? r4(t.beat / t.beatN) : null });

// (DECISIONS.md D48: a row's price read only facts from before its snapshot: no factsAt stamp (nothing day-of read,
// a version from before the stamps), or one at or before its time)
export const knownAt = (x) => !fin(x.factsAt) || (fin(x.at) && x.factsAt <= x.at);
// (the bets whose price read a fact dated after their placement: none, ever (the timestamp test))
export const lateFacts = (bets) => bets.filter((b) => fin(b.factsAt) && !(fin(b.at) && b.factsAt <= b.at));
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
// Kelly (desk.mjs stakeKelly), its return, its edge before the vig
function sideOf(V, x, p) {
  const evA = p * dec(x.overOdds) - 1;
  const evB = (1 - p) * dec(x.underOdds) - 1;
  const over = evA >= evB;
  const pS = over ? p : 1 - p;
  const fS = over ? x.f : 1 - x.f;
  const odds = over ? x.overOdds : x.underOdds;
  return { over, pS, fS, odds, ev: over ? evA : evB, edge: pS - fS, kelly: V.desk.stakeKelly(odds, pS) };
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

// (a bet's result on its side, the close's price beaten or not where it was placed at the open: the price on the
// same side at the same line, a line market by the line itself)
function beatOf(x, over, odds, close) {
  if (!close || !close.overOdds || !close.underOdds) return null;
  const cp = over ? close.overOdds : close.underOdds;
  if (x.market === 'ml' || close.line === x.line || x.line == null) {
    const d = impl(cp) - impl(odds);
    return d > 0 ? 1 : d < 0 ? 0 : null;
  }
  const d = x.market === 'spread' ? (over ? x.line - close.line : close.line - x.line) : over ? close.line - x.line : x.line - close.line;
  return d > 0 ? 1 : d < 0 ? 0 : null;
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
export function replayRecord(V, sport, rows, { events = null, names = () => ({ home: 'Home', away: 'Away', matchup: '' }), epoch = null, evScale = 0.08, now = Date.now(), sched = null } = {}) {
  const epochT = epoch ? Date.parse(epoch) : Infinity;
  const timing = V.leagues?.TIMING?.[sport] ?? { lines: 26, props: 26, lastChance: 3 };
  const practiceN = V.desk.PRACTICE_N?.[sport] ?? 3;
  const practiceUnits = V.desk.PRACTICE_UNITS ?? 0.5;
  const evSuspect = V.desk.EV_SUSPECT ?? 0.15;
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
        )
      : null;
  const bets = [];
  const passes = [];
  const flags = { open: 0, close: 0, openSeen: 0, openClean: 0, openInWindow: 0, openHeld: 0, closeHeld: 0, barred: 0 };
  const keys = new Set([...opens.keys(), ...closes.keys()]);
  for (const k of keys) {
    const o = opens.get(k);
    const c = closes.get(k);
    let placed = null;
    if (o) {
      flags.openSeen++;
      const hours = fin(o.at) ? (o.t - o.at) / 36e5 : null;
      const inWindow = sport === 'mma' || (fin(hours) && hours <= (isLine(o) ? timing.lines : timing.props));
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
        if (sd.ev > 0) placed = { x: o, sd, timing: 'open', s, close: c ?? null };
      }
    }
    // (a close, or a lone open, whose price read a fact posted after it: neither bet nor picked (D48))
    if (!placed && c && !knownAt(c)) flags.closeHeld++;
    else if (!placed && c) {
      const sd = sideOf(V, c, c.p);
      if (sd.ev > 0) placed = { x: c, sd, timing: 'close', s: 1, close: null };
      else passes.push({ x: c, sd });
    } else if (!placed && o && knownAt(o)) {
      passes.push({ x: o, sd: sideOf(V, o, o.p) });
    }
    if (placed) {
      const { x, sd } = placed;
      const suspect = Math.abs(sd.ev) > evSuspect;
      const ev = suspect ? Math.sign(sd.ev) * evSuspect : sd.ev;
      // (a line whose segment hasn't earned its stake by that day: the practice stake, a LIKE, in the record as the
      // live desk's gated bets are)
      const barred = !!barAt && isLine(x) && !barAt(x.t, keysOf(x, sd), sd.ev);
      if (barred) flags.barred++;
      const fullUnits = suspect ? practiceUnits : V.desk.stakeFor(ev, evScale, sd.odds);
      const units = barred ? practiceUnits : fullUnits;
      let band = level(sd.kelly, sd.pS);
      if (band === 'low') band = 'medium';
      const fullBand = suspect && band !== 'medium' ? 'medium' : band;
      if ((suspect || barred) && band !== 'medium') band = 'medium';
      const bet = betOf(x, sd, { units, band, practice: false, timing: placed.timing, beat: placed.timing === 'open' ? beatOf(x, sd.over, sd.odds, placed.close) : null, names, survival: placed.s });
      // (a barred line keeps what it would have staked at full: the bar's own place below)
      if (barred) bet.full = { units: fullUnits, band: fullBand, profit: units > 0 ? r4((bet.profit * fullUnits) / units) : 0 };
      bets.push(bet);
      flags[placed.timing]++;
    }
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
      flags.barred--;
    }
    flags.bar = { applies: bar.applies, barUnits: bar.barUnits, fullUnits: bar.fullUnits, bySeason: bar.bySeason };
  }
  // (the slate's practice picks: each game's quota (PRACTICE_N over the ET day's games, at least one) less its bets
  // that clear the vig, from its PASS rows with an edge before the vig, best first, at the practice stake)
  const gamesOn = new Map();
  const everyRow = [...bets.map((b) => ({ day: etDay(b.t), event: b.event })), ...passes.map((r) => ({ day: etDay(r.x.t), event: String(r.x.event) }))];
  for (const r of everyRow) (gamesOn.get(r.day) ?? gamesOn.set(r.day, new Set()).get(r.day)).add(r.event);
  const betOn = new Map();
  for (const b of bets) betOn.set(b.event, (betOn.get(b.event) ?? 0) + 1);
  const passBy = new Map();
  for (const r of passes) (passBy.get(String(r.x.event)) ?? passBy.set(String(r.x.event), []).get(String(r.x.event))).push(r);
  for (const [event, rs] of passBy) {
    const quota = V.desk.slateQuota(practiceN, gamesOn.get(etDay(rs[0].x.t))?.size ?? 1);
    const need = Math.max(0, quota - (betOn.get(event) ?? 0));
    const picked = rs.filter((r) => r.sd.edge > 0).sort((a, b) => b.sd.edge - a.sd.edge).slice(0, need);
    for (const r of picked) {
      r.practice = true;
      bets.push(betOf(r.x, r.sd, { units: practiceUnits, band: 'medium', practice: true, timing: r.x.kind === 'o' ? 'open' : 'close', beat: r.x.kind === 'o' ? beatOf(r.x, r.sd.over, r.sd.odds, closes.get(r.x.key ?? r.x.id.replace(/:o$/, '')) ?? null) : null, names, survival: 1 }));
    }
  }
  bets.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const passed = passes.filter((r) => !r.practice);
  return summarize(sport, bets, passed, { epoch, now, flags, rows: { open: opens.size, close: closes.size }, seasonsWithProps: new Set([...opens.values(), ...closes.values()].filter((x) => x.market === 'prop').map((x) => x.season)), seasonsAll: new Set([...opens.values(), ...closes.values()].map((x) => x.season)) });
}

function betOf(x, sd, { units, band, practice, timing, beat, names, survival }) {
  const res = x.y === null || x.y === undefined ? 'P' : (x.y === 1) === sd.over ? 'W' : 'L';
  const profit = res === 'W' ? r2(units * (dec(sd.odds) - 1)) : res === 'L' ? -units : 0;
  const w = wordsOf(x, sd.over, names);
  return { factsAt: fin(x.factsAt) ? x.factsAt : null, id: x.key ?? x.id, event: String(x.event), sport: x.sport, season: x.season, market: x.market, stat: x.stat, line: x.line ?? null, side: sd.over ? (x.market === 'prop' || x.market === 'total' ? 'over' : 'home') : x.market === 'prop' || x.market === 'total' ? 'under' : 'away', pick: w.pick, matchup: w.matchup, player: w.player, odds: sd.odds, p: r4(sd.pS), fair: r4(sd.fS), kelly: r4(sd.kelly), band, practice, units, res, profit, timing, beat, survival: r4(survival), t: x.t, at: fin(x.at) ? x.at : timing === 'open' ? x.t - 24 * 36e5 : x.t - 36e5 };
}

// The file's content from the replayed bets (practice picks among them, flagged) and the rows that passed
export function summarize(sport, bets, passed, { epoch, now, flags, rows, seasonsWithProps, seasonsAll }) {
  const real = bets.filter((b) => !b.practice);
  const practice = bets.filter((b) => b.practice);
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
  const newest = bets.length ? Math.max(...bets.map(settledAt)) : now;
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
  const entry = (b) => ({ id: b.id, sport: b.sport, season: b.season, pick: b.pick, matchup: b.matchup, market: WALLET_MARKET[b.market] ?? b.market, player: b.player, stat: b.stat, line: b.line, side: b.side, odds: b.odds, p: b.p, fair: b.fair, kelly: b.kelly, band: b.band, practice: b.practice, units: b.units, res: b.res, profit: b.profit, timing: b.timing, beat: b.beat, survival: b.survival, at: new Date(b.at).toISOString(), factsAt: fin(b.factsAt) ? new Date(b.factsAt).toISOString() : null, start: new Date(b.t).toISOString(), settled: new Date(settledAt(b)).toISOString() });
  const all = tallyOf(real);
  return {
    v: REPLAY_V,
    sport,
    epoch,
    at: new Date(now).toISOString(),
    from: bets.length ? new Date(Math.min(...bets.map((b) => b.t))).toISOString() : null,
    through: bets.length ? new Date(Math.max(...bets.map((b) => b.t))).toISOString() : null,
    n: { rows: rows.open + rows.close, keys: real.length + practice.length + passed.length, bets: real.length, practice: practice.length, pass: passed.length },
    overall: all,
    practice: tallyOf(practice),
    // (the rows it wouldn't bet, at a flat unit on the Bot's side: context, never the record)
    pass: finishTally(passed.reduce((t, r) => addBet(t, { res: r.x.y === null || r.x.y === undefined ? 'P' : (r.x.y === 1) === r.sd.over ? 'W' : 'L', units: 1, profit: r.x.y === null || r.x.y === undefined ? 0 : (r.x.y === 1) === r.sd.over ? r2(dec(r.sd.odds) - 1) : -1, beat: null }), emptyTally())),
    byBand: Object.fromEntries(BANDS.map((bd) => [bd, tallyOf(real.filter((b) => b.band === bd))])),
    byMarket: { lines: tallyOf(real.filter(isLine)), props: tallyOf(real.filter((b) => !isLine(b))) },
    bySeason: seasons,
    byYear: years,
    days: daysOf(real),
    practiceDays: daysOf(practice),
    streak: decided.length ? `${decided[0].res}${n}` : null,
    streakAt: decided.slice(0, Math.min(n, STREAK_CAP)).map((b) => new Date(settledAt(b)).toISOString()),
    brokeAt: decided[n] ? new Date(settledAt(decided[n])).toISOString() : null,
    last: [...bets].sort(order).slice(0, REPLAY_LAST).map(entry),
    flags: {
      timing: { open: flags.open, close: flags.close, openSeen: flags.openSeen, openClean: flags.openClean, openInWindow: flags.openInWindow, barred: flags.barred ?? 0 },
      // (the bar's own place (D51): whether it stakes the lines, by season and for what comes next)
      ...(flags.bar ? { bar: flags.bar } : {}),
      // (D48, no look-ahead by timestamp: the bets with a factsAt stamp, those past their placement (0), the opens held
      // to the close and the closes left unbet because their price read a fact posted after them)
      facts: { stamped: bets.filter((b) => fin(b.factsAt)).length, late: lateFacts(bets).length, openHeld: flags.openHeld ?? 0, closeHeld: flags.closeHeld ?? 0 },
      // (MMA's bouts are priced by the fights model whole: every season full)
      context: sport === 'mma' ? { full: [...seasonsAll].sort(), ratingsOnly: [] } : { full: [...seasonsAll].filter((s) => seasonsWithProps.has(s)).sort(), ratingsOnly: [...seasonsAll].filter((s) => !seasonsWithProps.has(s)).sort() },
      price: PRICE_NOTE,
      placement: sport === 'mma' ? MMA_PLACEMENT_NOTE : PLACEMENT_NOTE,
      split: 'games that start before the epoch replayed; the live ledger from the epoch on',
      notSeen: "the live desk's CLV gates, CHECKs, research and news",
    },
  };
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
  parts.push("the Book's price nearest the placement, never shopped; the live desk's gates, CHECKs and research can't be replayed");
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
