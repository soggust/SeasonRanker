// The model desk's MMA run (run.mjs hands a fights league here: leagues.mjs LEAGUES.mma.fights): fights, not
// games, so the team machinery (ratings, context, margins, props) is left aside and the desk's shared parts are
// reused as they are: the trust path (desk.mjs fitTrust, chanceAt), the staking (stakeFor, placement), the
// timing (timing.mjs phaseOf, lastChanceOf), The Odds API (oddsapi.mjs, its credits and budget), CLV (clv.mjs),
// the picks' bands (picks.mjs) and the files the desk component and the Bets page read (ledger.json,
// state.json, picks.json under apps/mma/src/StaticData/model).
//
// Every run:
//   1. the model refit from what's kept (fights-model.mjs buildModel: the archive and the fighters' cache, both
//      written by the MMA app's nightly update; seconds)
//   2. the UFC's cards from ESPN's scoreboard, the last three days and the next five: each bout kept in
//      apps/mma/scripts/model/games.json (its card, date, division, rounds, both fighters, its status and
//      winner). A bout gone from its card, or one whose fighters changed (a pull, a replacement), is marked off,
//      and its open bets void (the book's rule: a bet on a fighter who's replaced is void)
//   3. the close for the bets on bouts under way or done (the desk's own last Odds API price inside 3 hours of
//      the start, else ESPN's board after the bout: ESPN BET's line, the only one ESPN keeps for MMA) and each
//      bet's CLV; then the grading from the bout's result (a draw or a no contest: void, the stake back)
//   4. the moneyline's trust refit on the league's graded bets and closes (desk.mjs fitTrust: the starting trust
//      till 40; the league started 2026-10-16, MMA_START, so no older epoch's bets judge it)
//   5. the bouts due (leagues.mjs TIMING.mma: inside 72 hours of the start, the last chance 4) priced: one
//      ask of The Odds API for the whole MMA board (2 credits: two markets, one region of books) when any bout is
//      due and the day's allowance has it, each bout matched to the board by both fighters' names (accents and
//      spacing dropped; a surname-and-initial match accepted only beside the other fighter's exact one; every
//      unmatched bout logged, never guessed). DraftKings' prices are the ones bet; Pinnacle's pair, the vig out,
//      is the fair chance where it posts the bout, else DraftKings' own. The better side at the trusted chance
//      (chanceAt) is bet where the model's vig-free chance beats the book's fair by the league's edge (EDGE) and
//      its return is positive: 0.5 to 1 unit while the trust is untested, the TRUST path's 3 beyond; a side with
//      no edge is tracked (units 0, graded and learned from, never staked); a line moved against the side since
//      the first price seen by the guard's limit cuts it to the minimum; the model too far from the book (GAP) is
//      skipped. One bet a bout. Inside the last call with no API price: ESPN BET's line, tracked only.
//      ROUND TOTALS (2026-10-17, the second market: fights-totals.mjs): the same ask carries totals
//      (markets=h2h,totals: 2 credits, the books TOTAL_BOOKS, one region), each bout's row priced from the book's
//      line against Pinnacle's pair at that point (else the least-vig listed book's, else the book's own) by the
//      totals' own model and trust (trust.total); TRACKED ONLY till TOTAL_LIVE are graded with a close, then the
//      trust path as the moneyline's. One a bout; a bout whose total isn't posted yet is asked about again after
//      TOTAL_REST; graded by the bout's length (ESPN's last round and clock: Over 2.5 past 2:30 of the third), a no
//      contest before the line void. The board carries it as k.total [over, under]
//   6. the picks (the page's rows: the open edge bets by their Kelly score, published once locked), the state
//      and the ledger written when changed (--dry: nothing committed touched, a snapshot in .cache/model)
//   7. the betting board (the owner, 2026-10-17: "I should still be able to place bets on all the fights"): every
//      bout on a card not started, each side's moneyline with the book's price, the model's chance, Kelly score and
//      band, in board.mjs's shape (buildMmaBoard, the team sports' run.mjs writeBoard), written when it changes
//      to apps/mma/src/StaticData/model/board.json (the Bets page's game view, lines.service.ts) with the prices
//      seen (board-seen.json: the play-money settler's). The prices are what the run already asked (the credit
//      rule: no ask for the board's sake): this run's Odds API lines where a bout was due, else the last board's
//      DraftKings price, else ESPN BET's line (free, marked src 'espn bet'). A bout gone from it once it starts,
//      or off. --dry with --board-out=<dir>: written there as board-mma.json, nothing committed touched
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOOK, LEAGUES, TIMING } from './leagues.mjs';
import { TERMS, TOTAL_TERMS, backtest, boutSeconds, buildModel, fitRows, totalsTerms } from './fights-model.mjs';
import { TOTAL_BOOKS, TOTAL_LIVE, backtestTotals, fitTotals, liveCount, predictTotal, settleTotal, totalLinesOf, totalPickFor, totalReasonOf, totalRows } from './fights-totals.mjs';
import { weightOf } from '../../../../apps/mma/scripts/rating.mjs';
import { BANKROLL, chanceAt, decimal, fairPair, fitTrust, gapGuard, isTracked, placement, record, stakeFor, trackedRecord } from './desk.mjs';
import { BANDS, TOP, edgeLevel, kellyOf, levelOf, scoreParts } from './picks.mjs';
import { buildBoard, seenUpdate } from './board.mjs';
import { clvOf, clvSummary } from './clv.mjs';
import { SHARP, american, call, canSpend, hasKey, usageSummary } from './oddsapi.mjs';
import { REPRICE_BY, lastChanceOf, phaseOf } from './timing.mjs';
import { CACHE, DAY, get, readJson, writeAtomic, writeJson } from './sources.mjs';
import { round } from './ratings.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const SPORT = 'mma';
// (the league's start on the desk: its trust is fit on the bets since, which is all of them)
export const MMA_START = '2026-10-16T00:00:00Z';
const START_TRUST = 0.5;
const EV_SCALE = 0.08;
// (the most an untested market stakes a bout)
const UNTESTED_MAX = 1;
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc';
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const ODDS_ROUTE = '/sports/mma_mixed_martial_arts/odds';
// (the Odds API's bout time against ESPN's card time: a bout is on a card within this)
const MATCH_WINDOW = 48 * 36e5;
// (a bout skipped or unpriced waits this long before it's asked about again)
const REST_FOR = 3 * 36e5;
// (a round total the book hadn't posted: asked about again after this)
const TOTAL_REST = 12 * 36e5;
// (an open bet's last price inside this of the start stands as its close)
const SEEN_CLOSE = 3 * 36e5;
// (inside this of the start with no API price, ESPN's board is used, tracked only)
const LAST_CALL = 2 * 36e5;
// (the board's days: finals behind, cards ahead)
const BACK_DAYS = 3;
const AHEAD_DAYS = 5;
export const headshot = (id) => `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`;

export const FILES = {
  games: path.join(ROOT, 'apps/mma/scripts/model/games.json'),
  backtest: path.join(ROOT, 'apps/mma/scripts/model/backtest.json'),
  state: path.join(ROOT, 'apps/mma/src/StaticData/model/state.json'),
  ledger: path.join(ROOT, 'apps/mma/src/StaticData/model/ledger.json'),
  picks: path.join(ROOT, 'apps/mma/src/StaticData/model/picks.json'),
  board: path.join(ROOT, 'apps/mma/src/StaticData/model/board.json'),
  boardSeen: path.join(ROOT, 'apps/mma/scripts/model/board-seen.json'),
  rest: path.join(CACHE, 'lines-rest-mma.json'),
};

const readKept = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

// ---------------------------------------------------------------------------------------------------------
// Names: ESPN's against The Odds API's

// A name's key: lower case, accents and everything but letters dropped ("Lucia Szabová" and "Lucia Szabova",
// "SuYoung You" and "Su Young You" the same)
export const nameKey = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

// (a name's tokens, the same way)
const tokens = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

// How well two names match: 2 the same key, 1 the same surname and first initial (a nickname, a shortened first
// name: "Alex" for "Alexander"), 0 not
export function nameMatch(a, b) {
  if (nameKey(a) === nameKey(b)) return 2;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length < 2 || tb.length < 2) return 0;
  return ta.at(-1) === tb.at(-1) && ta[0][0] === tb[0][0] ? 1 : 0;
}

// A bout's event on the board, or null: both fighters matched (one exact at least, the pair summing to 3 or
// more) within MATCH_WINDOW of the bout's date; the API's sides mapped to the bout's (home: ESPN's first)
export function matchBout(bout, events) {
  let best = null;
  for (const ev of events) {
    const gap = Math.abs(Date.parse(ev.commence_time) - Date.parse(bout.date));
    if (gap > MATCH_WINDOW) continue;
    const straight = nameMatch(bout.home.name, ev.home_team) + nameMatch(bout.away.name, ev.away_team);
    const crossed = nameMatch(bout.home.name, ev.away_team) + nameMatch(bout.away.name, ev.home_team);
    const score = Math.max(straight, crossed);
    const exactOne = straight >= crossed ? nameMatch(bout.home.name, ev.home_team) === 2 || nameMatch(bout.away.name, ev.away_team) === 2 : nameMatch(bout.home.name, ev.away_team) === 2 || nameMatch(bout.away.name, ev.home_team) === 2;
    if (score < 3 || !exactOne) continue;
    if (!best || score > best.score || (score === best.score && gap < best.gap)) best = { ev, score, gap, crossed: crossed > straight };
  }
  return best;
}

// A matched event's DraftKings prices for the bout's sides and the fair chance of its home side: Pinnacle's
// pair at the same event, the vig out, where it has both; else DraftKings' own
export function linesOf(bout, m) {
  const { ev, crossed } = m;
  const apiSide = (side) => (crossed ? (side === 'home' ? ev.away_team : ev.home_team) : side === 'home' ? ev.home_team : ev.away_team);
  const priceOf = (bookKey, side) => {
    const book = (ev.bookmakers ?? []).find((b) => b.key === bookKey);
    const market = book?.markets?.find((x) => x.key === 'h2h');
    const o = market?.outcomes?.find((x) => x.name === apiSide(side));
    return o?.price ? american(o.price) : null;
  };
  const dk = { home: priceOf(BOOK, 'home'), away: priceOf(BOOK, 'away') };
  if (!dk.home || !dk.away) return null;
  const pin = { home: priceOf(SHARP, 'home'), away: priceOf(SHARP, 'away') };
  const sharp = pin.home && pin.away ? fairPair(pin.home, pin.away) : null;
  return { odds: dk, fair: sharp ?? fairPair(dk.home, dk.away), fairFrom: sharp ? 'pinnacle' : 'its own prices', start: ev.commence_time, oddsEvent: ev.id };
}

// ---------------------------------------------------------------------------------------------------------
// The cards: ESPN's scoreboard

// A scoreboard's bouts (each with its card; a bout with two named fighters; the first listed is 'home')
export function boutsOf(board) {
  const out = [];
  for (const e of board?.events ?? []) {
    for (const c of e.competitions ?? []) {
      const comps = [...(c.competitors ?? [])].sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
      if (comps.length !== 2) continue;
      const side = (p) => ({ id: String(p.id), name: p.athlete?.displayName ?? p.name ?? '' });
      const statusName = c.status?.type?.name ?? '';
      const completed = !!c.status?.type?.completed;
      const winner = completed ? (comps[0].winner ? 'home' : comps[1].winner ? 'away' : null) : null;
      out.push({
        id: String(c.id),
        card: String(e.id),
        cardName: e.name ?? '',
        date: c.date ?? e.date,
        division: c.type?.abbreviation ?? c.type?.text ?? '',
        rounds: c.format?.regulation?.periods ?? 3,
        home: side(comps[0]),
        away: side(comps[1]),
        final: completed,
        winner,
        // (how long it lasted: ESPN's last round and the clock into it, for the round totals)
        period: completed && Number.isFinite(c.status?.period) ? c.status.period : null,
        clock: completed && Number.isFinite(c.status?.clock) ? c.status.clock : null,
        off: /CANCEL|POSTPONE/i.test(statusName) ? statusName.replace('STATUS_', '').toLowerCase() : null,
      });
    }
  }
  return out;
}

async function readBoard(now) {
  const from = ymd(now.getTime() - BACK_DAYS * DAY);
  const to = ymd(now.getTime() + AHEAD_DAYS * DAY);
  const body = await get(`${SITE}/scoreboard?dates=${from}-${to}&limit=100`);
  return body ? boutsOf(body) : null;
}

// The bouts kept, brought up to the board: a kept bout gone from a card the board still lists is off
// (cancelled); one whose fighters changed is off (replaced) and the new pairing kept beside it under its own
// key. Returns the kept list
export function mergeBouts(kept, board, now) {
  const byKey = new Map(kept.map((b) => [b.key, b]));
  const cards = new Set(board.map((b) => b.card));
  const seen = new Set();
  for (const b of board) {
    const key = `${b.id}:${b.home.id}-${b.away.id}`;
    seen.add(key);
    const was = byKey.get(key);
    byKey.set(key, { ...(was ?? {}), ...b, key, firstSeen: was?.firstSeen ?? now.toISOString(), off: b.off ?? (was?.off && was.off !== 'cancelled' && was.off !== 'replaced' ? was.off : null) });
    // (the same bout id with other fighters: the old pairing is off)
    for (const old of byKey.values()) {
      if (old.id === b.id && old.key !== key && !old.final && !old.off) old.off = 'replaced';
    }
  }
  for (const b of byKey.values()) {
    if (seen.has(b.key) || b.final || b.off) continue;
    // (on a card the board shows, but gone from it: cancelled; a card not on the board (past its days): left)
    if (cards.has(b.card)) b.off = 'cancelled';
  }
  // (kept 60 days)
  return [...byKey.values()].filter((b) => now.getTime() - Date.parse(b.date) < 60 * DAY).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// ESPN's own board for a bout (ESPN BET: the one provider ESPN keeps for MMA): each side's moneyline, by the
// athletes' ids; null without one
export async function espnOdds(bout) {
  const body = await get(`${CORE}/events/${bout.card}/competitions/${bout.id}/odds?lang=en&region=us`);
  const item = body?.items?.[0];
  if (!item) return null;
  const num = (v) => {
    const n = Number(String(v ?? '').replace('+', ''));
    return Number.isFinite(n) && n ? n : null;
  };
  const read = (o) => ({ id: o?.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1] ?? null, ml: num(o?.current?.moneyLine?.american ?? o?.moneyLine) });
  const sides = [read(item.homeAthleteOdds), read(item.awayAthleteOdds)];
  const home = sides.find((s) => s.id === bout.home.id) ?? sides[0];
  const away = sides.find((s) => s.id === bout.away.id && s !== home) ?? sides.find((s) => s !== home);
  if (!home?.ml || !away?.ml) return null;
  return { odds: { home: home.ml, away: away.ml }, fair: fairPair(home.ml, away.ml), fairFrom: 'espn bet', provider: item.provider?.name ?? 'ESPN BET' };
}

// ---------------------------------------------------------------------------------------------------------
// Grading

// A bet's void from its bout's changes, either market's (the bout off or its fighters changed), or null
export function boutVoid(bet, bout, now) {
  if (!bout) return null;
  const changed = bout.home.id !== bet.fighters.home.id || bout.away.id !== bet.fighters.away.id;
  if (bout.off === 'replaced' || changed) return { status: 'push', profit: 0, void: true, final: 'fighter replaced', why: 'Void: a fighter was replaced' };
  if (bout.off === 'cancelled' || bout.off === 'canceled') return { status: 'push', profit: 0, void: true, final: 'bout cancelled', why: 'Void: bout cancelled' };
  if (bout.off && now - Date.parse(bet.start) > 48 * 36e5) return { status: 'push', profit: 0, void: true, final: `bout ${bout.off}`, why: `Void: bout ${bout.off}, not fought within 48 hours` };
  return null;
}

// (a final bout's length in seconds, null where ESPN gave no round: fights-model.mjs boutSeconds)
export const boutSecs = (bout) => (bout?.final && Number.isFinite(bout.period) && bout.period > 0 ? boutSeconds({ rounds: bout.rounds, period: bout.period, clock: bout.clock }) : null);

// A bet against its bout: won, lost, or void (a draw, a no contest, the bout off or its fighters changed); a
// round total by the bout's length (fights-totals.mjs settleTotal)
export function settleBout(bet, bout, now) {
  if (!bout) return null;
  const off = boutVoid(bet, bout, now);
  if (off) return off;
  if (bet.market === 'total') return settleTotal(bet, bout, boutSecs);
  if (!bout.final) return null;
  const final = `${bout.home.name} vs ${bout.away.name}: ${bout.winner === null ? 'no winner (draw or no contest)' : `${bout[bout.winner].name} won`}`;
  if (bout.winner === null) return { status: 'push', profit: 0, void: true, final, why: 'Void: a draw or a no contest' };
  const won = bout.winner === bet.side;
  const units = isTracked(bet) ? 0 : bet.units;
  return { status: won ? 'won' : 'lost', profit: round(won ? units * (decimal(bet.odds) - 1) : -units, 3), final };
}

// ---------------------------------------------------------------------------------------------------------
// Pricing

// The pick for a bout: the better side at the trusted chance, its stake, and why it's not an edge bet if it
// isn't. model: the home side's chance; lines: { odds: { home, away }, fair (home) }
export function pickFor(model, lines, trust, { edge, untested, guard = null, apiPrice = true }) {
  const sides = ['home', 'away'].map((side) => {
    const fair = side === 'home' ? lines.fair : 1 - lines.fair;
    const m = side === 'home' ? model : 1 - model;
    const odds = lines.odds[side];
    const p = chanceAt('ml', fair, m, trust);
    const ev = p * decimal(odds) - 1;
    return { side, odds, fair, model: m, p, ev, units: stakeFor(ev, EV_SCALE, odds) };
  });
  const pick = sides[0].ev >= sides[1].ev ? sides[0] : sides[1];
  const other = pick === sides[0] ? sides[1] : sides[0];
  const gap = gapGuard('ml', pick.model, pick.fair);
  if (gap) return { skip: gap.why, pick, other };
  const hasEdge = pick.ev > 0 && pick.model - pick.fair >= edge && apiPrice;
  let units = untested ? Math.min(UNTESTED_MAX, pick.units) : pick.units;
  const flags = [];
  if (guard) {
    flags.push(guard);
    units = 0.5;
  }
  if (!apiPrice) flags.push("no Odds API price (ESPN's board)");
  const why = !apiPrice ? "no Odds API price: ESPN's board, tracked" : pick.ev <= 0 ? 'no edge at the trusted chance' : pick.model - pick.fair < edge ? `the model's lean (${round((pick.model - pick.fair) * 100, 1)} points) under the league's edge (${edge * 100})` : null;
  return { pick, other, placed: placement(hasEdge, units), flags, why };
}

// A bet's plain write-up from its own numbers: the model's chance against the book's, the terms that carried
// it, the chance bet with and the break-even
export function reasonOf(bet) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const parts = Object.entries(bet.context?.parts ?? {})
    .map(([k, v]) => [k, bet.side === 'home' ? v : -v])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  const label = Object.fromEntries(TERMS);
  const carried = parts.filter(([, v]) => v > 0).map(([k, v]) => `${label[k] ?? k} (+${round(v, 2)} in log odds)`);
  const against = parts.filter(([, v]) => v < 0).map(([k, v]) => `${label[k] ?? k} (${round(v, 2)})`);
  const pieces = [`The model gives ${bet.pick} a ${pct(bet.model)} chance against the book's ${pct(bet.fair)} (${bet.fairFrom === 'pinnacle' ? "Pinnacle's line, the vig out" : bet.fairFrom === 'espn bet' ? "ESPN BET's line, the vig out" : "DraftKings' own prices, the vig out"}).`];
  if (carried.length) pieces.push(`For it: ${carried.join(', ')}.`);
  if (against.length) pieces.push(`Against it: ${against.join(', ')}.`);
  pieces.push(`The desk bets at ${pct(bet.p)} (trust ${round(bet.context?.trust ?? 0, 2)}${bet.context?.untested ? ', untested: the lean halfway' : ''}); the price needs ${pct(1 / decimal(bet.odds))} to break even.`);
  if (bet.context?.flags?.length) pieces.push(`Flagged: ${bet.context.flags.join('; ')}.`);
  return pieces.join(' ');
}

// ---------------------------------------------------------------------------------------------------------
// The betting board (board.mjs's shape: the Bets page's game view lists every priced bout, the picks only the
// bot's suggestions). A bout's moneyline as the board's two sides [home, away]: each at the book's price (o), the
// bot's trusted chance (c: desk.mjs chanceAt, as pickFor prices it), its Kelly score (ks) and band (b: the picks'
// bands, LIKE at the least with an edge, PASS (low) without one or past the gap guard, as boardMarkets'); src
// 'espn bet' where the price is ESPN BET's line (no DraftKings price asked or kept), else none (DraftKings').
// lines: { odds: { home, away }, fair (the home side's) }; chance: the model's chance of the home side
export function boardSidesOf(lines, chance, trust, src = null) {
  const gap = gapGuard('ml', chance, lines.fair);
  return ['home', 'away'].map((side) => {
    const fair = side === 'home' ? lines.fair : 1 - lines.fair;
    const m = side === 'home' ? chance : 1 - chance;
    const odds = lines.odds[side];
    const p = chanceAt('ml', fair, m, trust);
    const ev = p * decimal(odds) - 1;
    const ks = kellyOf(odds, p);
    return { s: side, l: null, o: odds, c: round(p, 3), ks, b: gap || !(ev > 0) ? 'low' : edgeLevel(ks, p), ...(src ? { src } : {}) };
  });
}
// A bout's round total as the board's two sides [over, under] (as boardSidesOf: the book's price, the trusted chance,
// Kelly and band at its line). total: fights-totals.mjs totalLinesOf's { line, odds: { over, under }, fair (over's) };
// over: the model's chance of Over at its line
export function boardTotalOf(total, over, trust) {
  const gap = gapGuard('total', over, total.fair);
  return ['over', 'under'].map((side) => {
    const fair = side === 'over' ? total.fair : 1 - total.fair;
    const m = side === 'over' ? over : 1 - over;
    const odds = total.odds[side];
    const p = chanceAt('total', fair, m, trust);
    const ev = p * decimal(odds) - 1;
    const ks = kellyOf(odds, p);
    return { s: side, l: total.line, o: odds, c: round(p, 3), ks, b: gap || !(ev > 0) ? 'low' : edgeLevel(ks, p) };
  });
}
// (the last board's round total for a bout: { line, odds, fair }, else null)
export function boardTotalLinesOf(prev, boutId) {
  const g = (prev?.games ?? []).find((x) => String(x.id) === String(boutId));
  const over = g?.k?.total?.find((s) => s.s === 'over');
  const under = g?.k?.total?.find((s) => s.s === 'under');
  if (!over?.o || !under?.o || !Number.isFinite(over.l)) return null;
  return { line: over.l, odds: { over: over.o, under: under.o }, fair: fairPair(over.o, under.o), fairFrom: 'its own prices' };
}
// (the last board's DraftKings prices for a bout (its ml sides, neither ESPN BET's): { odds, fair }, else null)
export function boardLinesOf(prev, boutId) {
  const g = (prev?.games ?? []).find((x) => String(x.id) === String(boutId));
  const home = g?.k?.ml?.find((s) => s.s === 'home');
  const away = g?.k?.ml?.find((s) => s.s === 'away');
  if (!home?.o || !away?.o || home.src || away.src) return null;
  return { odds: { home: home.o, away: away.o }, fair: fairPair(home.o, away.o), fairFrom: 'its own prices' };
}
// The board from the bouts coming (not final, not off, not started), each priced from what the run has: lines
// (by the bout's key: { lines, src }) this run's, else the last board's DraftKings price (boardLinesOf), else
// nothing (no tile); chance(bout): the model's chance of the home side; trust: the moneyline's; bets: the ledger's
// (the bot's open side marked, as buildBoard marks it); prev: the last board (a bout no longer coming dropped). The
// round total beside it (k.total) the same way: this run's (lines' entry's total), else the last board's; over(bout,
// day, line): the model's chance of Over (null where it has none at that line); totalTrust: the totals' trust
export function buildMmaBoard({ bouts, lines, chance, trust, over = null, totalTrust = 0, bets = [], prev = null, now = new Date() }) {
  const at = now.toISOString();
  const coming = bouts.filter((b) => !b.final && !b.off && Date.parse(b.start ?? b.date) > now.getTime());
  const ids = new Set(coming.map((b) => String(b.id)));
  const games = new Map();
  for (const bout of coming) {
    const mine = lines?.get?.(bout.key) ?? null;
    const l = mine?.lines ?? boardLinesOf(prev, bout.id);
    const t = mine?.total ?? boardTotalLinesOf(prev, bout.id);
    const src = mine ? mine.src ?? null : null;
    const start = bout.start ?? bout.date;
    const markets = {};
    const p = l?.odds?.home && l?.odds?.away ? chance(bout, Date.parse(start)) : null;
    if (Number.isFinite(p)) markets.ml = boardSidesOf(l, p, trust, src);
    const o = t && over ? over(bout, Date.parse(start), t.line) : null;
    if (Number.isFinite(o)) markets.total = boardTotalOf(t, o, totalTrust);
    if (!markets.ml && !markets.total) continue;
    // (the fighters as the board's teams: [name, ESPN id, his headshot], the first ESPN lists the home side)
    const game = { date: start, awayAbbr: bout.away.name, homeAbbr: bout.home.name, away: bout.away.id, home: bout.home.id };
    games.set(String(bout.id), { game, markets, at });
  }
  const kept = prev ? { ...prev, games: (prev.games ?? []).filter((g) => ids.has(String(g.id))) } : null;
  const board = buildBoard(SPORT, { prev: kept, games, bets, checks: [], now });
  for (const g of board.games) {
    const bout = coming.find((b) => String(b.id) === g.id);
    if (!bout) continue;
    g.a = [bout.away.name, bout.away.id, headshot(bout.away.id)];
    g.h = [bout.home.name, bout.home.id, headshot(bout.home.id)];
    g.card = bout.cardName;
  }
  return board;
}

// ---------------------------------------------------------------------------------------------------------
// The run

function changelog(state, at, what, from, to, why) {
  state.changelog ??= [];
  state.changelog.push({ at, what, from, to, why });
  state.changelog = state.changelog.slice(-200);
}

function writeIfChanged(file, data, dry) {
  if (dry) return false;
  const strip = (x) => (x && !Array.isArray(x) ? { ...x, updated: null, at: null } : x);
  const before = readJson(file, null);
  if (before && JSON.stringify(strip(before)) === JSON.stringify(strip(data))) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, JSON.stringify(data));
  return true;
}

// The picks file: the open edge bets on bouts not started, by their Kelly score, TOP at most; each published
// once locked (REPRICE_BY before the start), its chance, score and band fixed when first shown; the published
// record by band. The rows as picks.mjs buildPicks makes them, for the Bets page
export function buildFightPicks(ledger, trust, bouts, now) {
  const locked = (b) => Date.parse(b.start) - now.getTime() <= REPRICE_BY;
  for (const b of ledger.bets) {
    if (b.shown && !b.published && locked(b)) {
      Object.assign(b, { published: true, publishedAt: now.toISOString() });
      delete b.shown;
    }
  }
  const open = ledger.bets.filter((b) => b.status === 'open' && Date.parse(b.start) > now.getTime() && !isTracked(b) && !b.context?.guard);
  const scored = open.map((b) => {
    const { score, ...why } = scoreParts(b, trust);
    return { b, score, why };
  });
  scored.sort((x, y) => y.score - x.score || x.b.start.localeCompare(y.b.start));
  const top = scored.slice(0, TOP);
  const inTop = new Set(top.map((x) => x.b));
  for (const { b } of scored) if (!inTop.has(b) && b.shown) for (const k of ['shown', 'publishedP', 'publishedKelly', 'publishedLevel']) delete b[k];
  for (const { b, score } of top) {
    if (locked(b)) {
      if (!b.published) Object.assign(b, { published: true, publishedAt: now.toISOString() });
      delete b.shown;
    } else if (!b.published) b.shown = true;
    if (!Number.isFinite(b.publishedP)) b.publishedP = b.p;
    if (!Number.isFinite(b.publishedKelly)) b.publishedKelly = score;
    b.publishedLevel = levelOf(b, b.publishedKelly, b.publishedP);
  }
  const picks = top.map(({ b, score, why }, i) => ({
    id: b.id,
    rank: i + 1,
    sport: SPORT,
    score,
    chance: Math.round(b.p * 100),
    level: levelOf(b, score),
    edge: true,
    // (a round total, once its market is live (fights-totals.mjs TOTAL_LIVE): "Over 2.5 rounds", no fighter)
    kind: b.market === 'total' ? 'total' : 'moneyline',
    market: b.market === 'total' ? 'Total' : 'Moneyline',
    pick: b.pick,
    side: b.side,
    athlete: b.market === 'total' ? null : b.fighters?.[b.side]?.id ?? null,
    team: null,
    player: b.market === 'total' ? null : b.fighters?.[b.side]?.name ?? null,
    line: b.market === 'total' ? b.line : null,
    odds: b.odds,
    otherOdds: Number.isFinite(b.otherOdds) ? b.otherOdds : null,
    book: b.book ?? 'DraftKings',
    model: b.model,
    fair: b.fair,
    p: b.p,
    ev: b.ev,
    units: b.units,
    why,
    start: b.start,
    matchup: b.matchup,
    teams: [b.fighters.away, b.fighters.home].map((f) => ({ abbr: f.name, logo: headshot(f.id) })),
    where: { city: bouts.get(b.event)?.cardName ?? null, stadium: null, weather: null },
    reason: b.market === 'total' ? totalReasonOf(b) : reasonOf(b),
    by: 'plain',
  }));
  const published = ledger.bets.filter((b) => b.published && !isTracked(b));
  const tally = (list) => {
    const r = record(list);
    return { bets: r.bets, won: r.won, lost: r.lost, push: r.push, staked: r.staked, profit: r.profit, roi: r.roi, open: list.filter((b) => b.status === 'open').length };
  };
  const byLevel = Object.fromEntries(['lock', 'high', 'medium', 'low'].map((l) => [l, tally(published.filter((b) => b.publishedLevel === l))]));
  return { sport: SPORT, at: now.toISOString(), bands: BANDS, top: TOP, record: { graded: published.filter((b) => b.status !== 'open').length, overall: tally(published), byLevel }, picks, checks: [] };
}

// The state the desk component reads (desk-model.ts ModelState: a fights league has no teams, no team params)
export function stateOf(state, { model, bt, trust, ledger, now, lines = null, odds = null, totals = null }) {
  const terms = model.fit.terms;
  return {
    ...state,
    sport: SPORT,
    label: LEAGUES.mma.label,
    updated: now.toISOString(),
    fights: true,
    // (the model's weights: each term's full-fit weight, its z, its halves and its soft weight (fights-model.mjs))
    params: Object.fromEntries(terms.map((t) => [t.key, t.weight])),
    model: { terms, rows: model.fit.n, from: model.fit.from, to: model.fit.to, labels: Object.fromEntries(TERMS) },
    test: bt?.all ? { games: bt.all.model.n, winLogLoss: bt.all.model.logLoss, winHit: bt.all.model.acc, ratingLogLoss: bt.all.rating.logLoss, coinLogLoss: bt.all.coin.logLoss } : null,
    backtest: bt ?? state.backtest ?? null,
    trust,
    evScale: EV_SCALE,
    untestedMax: UNTESTED_MAX,
    edge: LEAGUES.mma.edge,
    history: { games: model.rows.length, finals: fitRows(model.rows).length, from: model.rows[0]?.date ?? null },
    teams: [],
    record: record(ledger.bets),
    tracked: trackedRecord(ledger.bets),
    clv: { all: clvSummary(ledger.bets), ml: clvSummary(ledger.bets.filter((b) => b.market === 'ml')), total: clvSummary(ledger.bets.filter((b) => b.market === 'total')) },
    // (the round totals (fights-totals.mjs): the fit's terms and base rates, held out against the base rates, and
    // how near the market is to live (tracked only till TOTAL_LIVE graded with a close))
    totals: totals ? { terms: totals.terms, base: totals.base, rows: totals.n, from: totals.from, to: totals.to, labels: Object.fromEntries(TOTAL_TERMS), test: bt?.totals ? { line25: bt.totals.line25, all: bt.totals.all, byDivision: bt.totals.byDivision } : null, live: liveCount(ledger.bets) >= TOTAL_LIVE, graded: liveCount(ledger.bets), liveAt: TOTAL_LIVE } : state.totals ?? null,
    lines: lines ?? state.lines ?? null,
    book: BOOK,
    odds: odds ?? state.odds ?? null,
    // (the league's start: its trust is fit on the bets since; leagues.mjs MODEL_EPOCH isn't bumped for it)
    epoch: MMA_START,
    changelog: state.changelog ?? [],
  };
}

// The league's first files (fights-model.mjs --seed): the model's state, an empty ledger, no picks
export function seedFiles(model, bt, now) {
  const ledger = readKept(FILES.ledger, { sport: SPORT, bankroll: BANKROLL, bets: [] });
  const state = readKept(FILES.state, { changelog: [] });
  if (!state.changelog?.length) changelog(state, now.toISOString(), 'MMA joins the desk', 0, 1, `The fifth league: UFC bouts' moneylines, a logistic model over point-in-time fighter stats and the MMA app's rating (soft terms, fit every run). Paper first: trust ${START_TRUST} untested, ${UNTESTED_MAX}u a bout at most till 40 bets are graded. Held out over the last three years: log loss ${bt.all.model.logLoss} against the rating alone's ${bt.all.rating.logLoss} and a coin's ${bt.all.coin.logLoss}`);
  const trust = { ml: fitTrust([], START_TRUST) };
  mkdirSync(path.dirname(FILES.state), { recursive: true });
  writeAtomic(FILES.state, JSON.stringify(stateOf(state, { model, bt, trust, ledger, now })));
  writeAtomic(FILES.ledger, JSON.stringify(ledger));
  writeAtomic(FILES.picks, JSON.stringify(buildFightPicks(ledger, trust, new Map(), now)));
}

export async function runMma({ dry = false, gap = null, now = new Date(), log = console, boardOut = null } = {}) {
  const at = now.toISOString();
  const cfg = LEAGUES.mma;
  const t0 = Date.now();
  const ledger = readKept(FILES.ledger, { sport: SPORT, bankroll: BANKROLL, bets: [] });
  ledger.bankroll = BANKROLL;
  const state = readKept(FILES.state, { changelog: [] });
  const rest = readJson(FILES.rest, {});
  const lastChance = lastChanceOf(SPORT, gap);
  log.log(`${SPORT}: the window ${TIMING.mma.lines}h before a bout, the last chance ${round(lastChance, 1)}h`);

  // 1. the model
  const model = await buildModel({ now });
  const kept = model.fit.terms.filter((t) => t.weight);
  log.log(`${SPORT}: the model fit on ${model.fit.n} bouts (${model.fit.from} to ${model.fit.to}): ${kept.length} of ${TERMS.length} terms at a weight: ${kept.map((t) => `${t.key} ${t.weight}`).join(', ')}`);
  // (the backtest: once a day, the first run of the day, kept in apps/mma/scripts/model/backtest.json)
  // (the round totals' fit beside it, fights-totals.mjs, on the same rows; its backtest in the same file, totals)
  const totals = fitTotals(totalRows(model.rows));
  const tKept = totals.terms.filter((t) => t.weight);
  log.log(`${SPORT}: round totals fit on ${totals.n} bouts: ${tKept.length} of ${TOTAL_TERMS.length} terms at a weight: ${tKept.map((t) => `${t.key} ${t.weight}`).join(', ')}`);
  let bt = readJson(FILES.backtest, null);
  if (!bt || bt.at.slice(0, 10) !== at.slice(0, 10) || !bt.totals) {
    bt = { ...backtest(model.rows, { now }), totals: backtestTotals(model.rows, { now }) };
    if (!dry) {
      mkdirSync(path.dirname(FILES.backtest), { recursive: true });
      writeAtomic(FILES.backtest, JSON.stringify(bt, null, 1));
    }
  }
  log.log(`${SPORT}: held out (${bt.halves[0]?.from} on, ${bt.all.model.n} bouts): model ${bt.all.model.logLoss}, the rating alone ${bt.all.rating.logLoss}, a coin ${bt.all.coin.logLoss}`);
  const t25 = bt.totals.line25;
  log.log(`${SPORT}: round totals held out at 2.5 (${t25.model.n} three-round bouts): model ${t25.model.logLoss}, the weight class's base rate ${t25.byClass.logLoss}, the line's ${t25.base.logLoss}`);
  // (a coming bout's chance of Over a line: both sides' numbers as the moneyline reads them, null off the lines)
  const overChance = (bout, day, line) => {
    const pred = model.chance(bout.home.id, bout.away.id, day, { rounds: bout.rounds });
    const t = predictTotal(totals, totalsTerms(pred.a, pred.b, weightOf({ division: bout.division })), line, bout.rounds);
    return t;
  };

  // 2. the cards
  const board = await readBoard(now);
  let bouts = readKept(FILES.games, []);
  if (board) bouts = mergeBouts(bouts, board, now);
  else log.warn(`${SPORT}: ESPN's scoreboard not read: the bouts as kept`);
  const byKey = new Map(bouts.map((b) => [b.key, b]));
  const byId = new Map(bouts.map((b) => [b.id, b]));
  const coming = bouts.filter((b) => !b.final && !b.off && Date.parse(b.date) > now.getTime());
  log.log(`${SPORT}: ${bouts.length} bouts kept, ${coming.length} coming on ${new Set(coming.map((b) => b.cardName)).size} cards`);

  // 3. the close, then the grading
  let closes = 0;
  for (const bet of ledger.bets) {
    if (bet.clv || bet.void || Date.parse(bet.start) > now.getTime()) continue;
    const bout = byKey.get(bet.boutKey) ?? byId.get(bet.event);
    if (bout?.off) continue;
    let close = null;
    // (a round total's close: its own last price seen, at the line seen then (ESPN keeps no MMA totals))
    const seenLine = bet.market === 'total' ? bet.seen?.line ?? bet.line : null;
    if (bet.seen && Date.parse(bet.start) - Date.parse(bet.seen.at) <= SEEN_CLOSE) close = { line: seenLine, odds: bet.seen.odds, fair: bet.seen.fair, source: 'odds api near the start' };
    else if (bout && bet.market !== 'total') {
      const espn = await espnOdds(bout).catch(() => null);
      if (espn) close = { line: null, odds: espn.odds[bet.side], fair: bet.side === 'home' ? espn.fair : 1 - espn.fair, source: `close (${espn.provider})` };
    }
    if (!close && bet.seen && now.getTime() - Date.parse(bet.start) > 3 * DAY) close = { line: seenLine, odds: bet.seen.odds, fair: bet.seen.fair, source: 'last seen' };
    if (!close) continue;
    bet.close = close;
    bet.clv = clvOf(bet, close, null);
    closes++;
  }
  let graded = 0;
  for (const bet of ledger.bets) {
    if (bet.status !== 'open') continue;
    const bout = byKey.get(bet.boutKey) ?? byId.get(bet.event);
    const result = settleBout(bet, bout, now.getTime());
    if (!result) continue;
    Object.assign(bet, result, { gradedAt: at });
    graded++;
  }
  if (closes || graded) log.log(`${SPORT}: ${closes} closes read, ${graded} bets graded`);

  // 4. the trust
  const trust = { ...(state.trust ?? {}) };
  const evidence = ledger.bets.filter((b) => (b.market ?? 'ml') === 'ml' && !b.void && (b.status !== 'open' || b.clv) && b.fairFrom === 'pinnacle' && Date.parse(b.placedAt ?? b.start) >= Date.parse(MMA_START));
  const fitted = fitTrust(evidence, START_TRUST);
  if (trust.ml && trust.ml.trust !== fitted.trust) changelog(state, at, 'moneyline trust in the model', trust.ml.trust, fitted.trust, `best fit to ${fitted.n} graded moneyline bets and ${fitted.clvN} closing lines (log loss ${fitted.logLoss})`);
  trust.ml = fitted;
  // (the round totals' own: every total row graded or closed, whichever book anchored it (they start 2026-10-17);
  // tracked only, whatever the fit says, till TOTAL_LIVE are graded with a close)
  const tFitted = fitTrust(ledger.bets.filter((b) => b.market === 'total' && !b.void && (b.status !== 'open' || b.clv)), START_TRUST);
  if (trust.total && trust.total.trust !== tFitted.trust) changelog(state, at, 'round totals trust in the model', trust.total.trust, tFitted.trust, `best fit to ${tFitted.n} graded round totals and ${tFitted.clvN} closing lines (log loss ${tFitted.logLoss})`);
  trust.total = tFitted;
  const totalsLive = liveCount(ledger.bets) >= TOTAL_LIVE;
  if (totalsLive && !state.totalsLiveAt) {
    state.totalsLiveAt = at;
    changelog(state, at, 'round totals staked', 0, 1, `${TOTAL_LIVE} round totals graded with a close: the market leaves tracked only for the trust path`);
  }

  // 5. the bouts due, priced
  // (each market's rows apart: the moneyline's and the round total's, one of each a bout)
  const rowsOf = (market, pred) => ledger.bets.filter((b) => (b.market ?? 'ml') === market && pred(b));
  const placedOn = new Set(rowsOf('ml', (b) => b.status === 'open' || b.gradedAt).map((b) => b.boutKey));
  const openOn = new Map(rowsOf('ml', (b) => b.status === 'open').map((b) => [b.boutKey, b]));
  const tPlacedOn = new Set(rowsOf('total', (b) => b.status === 'open' || b.gradedAt).map((b) => b.boutKey));
  const tOpenOn = new Map(rowsOf('total', (b) => b.status === 'open').map((b) => [b.boutKey, b]));
  // (a row placed: its price read again inside 3 hours of the start, for the close; none yet: due unless resting)
  const closeDue = (open, b, until) => !!open && until <= SEEN_CLOSE && !(open.seen && Date.parse(b.date) - Date.parse(open.seen.at) <= SEEN_CLOSE);
  const resting = (k, wait) => !!rest[k] && now.getTime() - Date.parse(rest[k]) < wait;
  const dueFor = new Map();
  const due = coming.filter((b) => {
    const until = Date.parse(b.date) - now.getTime();
    if (phaseOf(SPORT, 'lines', until, gap) === 'early') return false;
    const ml = placedOn.has(b.key) ? closeDue(openOn.get(b.key), b, until) : !resting(b.key, REST_FOR);
    // (a round total the book hadn't posted waits TOTAL_REST before it's asked about again: the totals post later
    // than the moneylines, and the ask's for the whole board)
    const total = tPlacedOn.has(b.key) ? closeDue(tOpenOn.get(b.key), b, until) : !resting(`${b.key}|total`, TOTAL_REST);
    dueFor.set(b.key, { ml, total });
    return ml || total;
  });
  let events = null;
  let linesSource = 'none due';
  if (due.length) {
    // (one ask for the whole board, both markets: 2 credits (markets x regions; TOTAL_BOOKS' 7 books are one region))
    if (hasKey() && canSpend('lines', 2)) {
      events = await call('lines', ODDS_ROUTE, { markets: 'h2h,totals', bookmakers: TOTAL_BOOKS.join(',') });
      linesSource = Array.isArray(events) ? `The Odds API (${events.length} bouts on the board)` : 'The Odds API: no answer';
    } else linesSource = hasKey() ? "The Odds API: the day's allowance spent" : "ESPN's board inside the last call (no Odds API key, or a dry run without --paid)";
    log.log(`${SPORT}: ${due.length} bouts due; lines: ${linesSource}`);
  }
  const pending = [];
  const unmatched = [];
  // (the prices this run read, by the bout's key: the board's (buildMmaBoard), no ask for its sake)
  const linesNow = new Map();
  // (a bout's entry for the board, its moneyline's or its total's added to what's there)
  const addLines = (key, add) => linesNow.set(key, { lines: null, src: null, ...(linesNow.get(key) ?? {}), ...add });
  for (const bout of due) {
    const until = Date.parse(bout.date) - now.getTime();
    const open = openOn.get(bout.key);
    const want = dueFor.get(bout.key);
    let lines = null;
    let apiPrice = false;
    let m = null;
    if (Array.isArray(events)) {
      m = matchBout(bout, events);
      if (m) {
        lines = linesOf(bout, m);
        apiPrice = !!lines;
        // (the API's bout time is the bout's own; ESPN's is the card's)
        if (lines?.start && Math.abs(Date.parse(lines.start) - Date.parse(bout.date)) < MATCH_WINDOW) bout.start = lines.start;
      } else unmatched.push(`${bout.home.name} vs ${bout.away.name} (${bout.cardName})`);
    }
    const start = bout.start ?? bout.date;
    if (lines) addLines(bout.key, { lines, src: apiPrice ? null : 'espn bet' });
    // (the round total, from the same event: an open row's price kept for its close (at its own line only), else
    // priced and tracked (fights-totals.mjs: tracked only till TOTAL_LIVE graded with a close))
    const tl = m ? totalLinesOf(m.ev) : null;
    if (tl) addLines(bout.key, { total: tl });
    const tOpen = tOpenOn.get(bout.key);
    if (tOpen) {
      if (tl && tl.line === tOpen.line) tOpen.seen = { at, line: tl.line, odds: tl.odds[tOpen.side], fair: round(tOpen.side === 'over' ? tl.fair : 1 - tl.fair, 4) };
    } else if (want.total && !tPlacedOn.has(bout.key)) {
      const tp = tl ? overChance(bout, Date.parse(start), tl.line) : null;
      const choice = tp ? totalPickFor(tp.p, tl, trust.total.trust, { live: totalsLive, untested: !trust.total.fitted, edge: cfg.edge }) : null;
      if (!choice || choice.skip) {
        if (choice?.skip) log.log(`${SPORT}: ${bout.home.name} vs ${bout.away.name} round total skipped: ${choice.skip}`);
        if (Array.isArray(events)) rest[`${bout.key}|total`] = at;
      } else {
        const { pick, other, placed, why } = choice;
        pending.push({
          id: `${bout.id}:total:${bout.home.id}-${bout.away.id}`,
          event: bout.id,
          boutKey: bout.key,
          card: bout.card,
          sport: SPORT,
          start,
          placedAt: new Date().toISOString(),
          matchup: `${bout.away.name} @ ${bout.home.name}`,
          fighters: { home: bout.home, away: bout.away },
          market: 'total',
          side: pick.side,
          line: tl.line,
          odds: pick.odds,
          otherOdds: other.odds,
          model: round(pick.model, 4),
          fair: round(pick.fair, 4),
          p: round(pick.p, 4),
          ev: round(pick.ev, 4),
          ...placed,
          book: 'DraftKings',
          fairFrom: tl.fairFrom,
          pick: `${pick.side === 'over' ? 'Over' : 'Under'} ${tl.line} rounds`,
          context: { division: bout.division, rounds: bout.rounds, cardName: bout.cardName, parts: tp.parts, base: tp.base, trust: trust.total.trust, untested: !trust.total.fitted, live: totalsLive, flags: [], ...(why ? { why } : {}) },
          seen: { at, line: tl.line, odds: pick.odds, fair: round(pick.fair, 4) },
          status: 'open',
          profit: 0,
        });
      }
    }
    // (the moneyline: only where it's due itself)
    if (!want.ml) continue;
    // (an open bet: its latest price kept for the close, nothing else)
    if (open) {
      if (lines) open.seen = { at, odds: lines.odds[open.side], fair: open.side === 'home' ? lines.fair : 1 - lines.fair };
      continue;
    }
    if (!lines && until <= LAST_CALL) {
      const espn = await espnOdds(bout).catch(() => null);
      if (espn) lines = { ...espn, start };
      if (lines) addLines(bout.key, { lines, src: 'espn bet' });
    }
    if (!lines) {
      if (Array.isArray(events) || !hasKey()) rest[bout.key] = at;
      continue;
    }
    const day = Date.parse(start);
    const pred = model.chance(bout.home.id, bout.away.id, day, { rounds: bout.rounds });
    // (the first price seen on the bout: the guard's reference, and the opening line kept for a later fit)
    state.opens ??= {};
    state.opens[bout.key] ??= { at, fair: round(lines.fair, 4), odds: lines.odds };
    const openFair = state.opens[bout.key].fair;
    const untested = !trust.ml.fitted;
    const sideOf = (s) => (s === 'home' ? 1 : -1);
    let guard = null;
    const choice = pickFor(pred.p, lines, trust.ml.trust, { edge: cfg.edge, untested, apiPrice });
    if (choice.skip) {
      log.log(`${SPORT}: ${bout.home.name} vs ${bout.away.name} skipped: ${choice.skip}`);
      rest[bout.key] = at;
      continue;
    }
    // (the market's move against the pick since the first price seen, in its side's fair chance)
    const move = round(sideOf(choice.pick.side) * (openFair - lines.fair), 4);
    if (cfg.guard.ml && move <= -cfg.guard.ml) guard = `line moved ${move} against it since it opened`;
    const final = guard ? pickFor(pred.p, lines, trust.ml.trust, { edge: cfg.edge, untested, apiPrice, guard }) : choice;
    const { pick, other, placed, flags, why } = final;
    const notice = bout.firstSeen && Date.parse(start) - Date.parse(bout.firstSeen) < 21 * DAY && bouts.some((b) => b.id === bout.id && b.off === 'replaced') ? 'short notice: a replacement inside 21 days' : null;
    if (notice) flags.push(notice);
    const id = `${bout.id}:ml:${bout.home.id}-${bout.away.id}`;
    const bet = {
      id,
      event: bout.id,
      boutKey: bout.key,
      card: bout.card,
      sport: SPORT,
      start,
      placedAt: new Date().toISOString(),
      // (the desk's form, 'away @ home': the page and the desk component split it there; the first fighter ESPN
      // lists is the home side)
      matchup: `${bout.away.name} @ ${bout.home.name}`,
      fighters: { home: bout.home, away: bout.away },
      market: 'ml',
      side: pick.side,
      line: null,
      odds: pick.odds,
      otherOdds: other.odds,
      model: round(pick.model, 4),
      fair: round(pick.fair, 4),
      p: round(pick.p, 4),
      ev: round(pick.ev, 4),
      ...placed,
      book: 'DraftKings',
      fairFrom: lines.fairFrom,
      pick: pick.side === 'home' ? bout.home.name : bout.away.name,
      context: { division: bout.division, rounds: bout.rounds, cardName: bout.cardName, parts: pred.parts, ratingP: pred.ratingP, trust: trust.ml.trust, untested, flags, move, ...(guard ? { guard } : {}), ...(why ? { why } : {}), records: { home: pred.a.record, away: pred.b.record } },
      seen: { at, odds: pick.odds, fair: round(pick.fair, 4), open: state.opens[bout.key] },
      status: 'open',
      profit: 0,
    };
    pending.push(bet);
  }
  if (unmatched.length) log.warn(`${SPORT}: ${unmatched.length} due bouts not on The Odds API's board by name (not guessed): ${unmatched.join('; ')}`);
  for (const b of pending) {
    log.log(`${SPORT}${dry ? ' (dry)' : ''}: ${isTracked(b) ? 'tracked ' : ''}${b.matchup}: ${b.pick} ${b.odds > 0 ? '+' : ''}${b.odds} ${isTracked(b) ? `0u (${b.trackUnits}u as an action bet; ${b.context.why})` : `${b.units}u ${levelOf(b, kellyOf(b.odds, b.p), b.p)}`} model ${b.model} fair ${b.fair} (${b.fairFrom}) p ${b.p} ev ${b.ev}${b.context.flags.length ? ` [${b.context.flags.join('; ')}]` : ''}`);
    ledger.bets.push(b);
  }
  const newBets = pending.filter((b) => !isTracked(b)).length;
  log.log(`${SPORT}: ${newBets} bets placed, ${pending.length - newBets} tracked`);
  if (!dry) writeJson(FILES.rest, Object.fromEntries(Object.entries(rest).filter(([, t]) => now.getTime() - Date.parse(t) < DAY)));

  // 6. the picks, the state, the files
  const boutsById = new Map(bouts.map((b) => [b.id, b]));
  const picks = buildFightPicks(ledger, trust, boutsById, now);
  const out = stateOf(state, { model, bt, trust, ledger, now, lines: linesSource, odds: hasKey() ? usageSummary() : null, totals });
  // 7. the betting board: every bout coming, priced from what the run has; a bout with no DraftKings price this run or
  // on the last board takes ESPN BET's line (free, src 'espn bet'), read again each run till a DraftKings price comes
  const prevBoard = readJson(FILES.board, null);
  for (const bout of coming) {
    if (linesNow.get(bout.key)?.lines || boardLinesOf(prevBoard, bout.id)) continue;
    const espn = await espnOdds(bout).catch(() => null);
    if (espn) addLines(bout.key, { lines: espn, src: 'espn bet' });
  }
  const mmaBoard = buildMmaBoard({ bouts, lines: linesNow, chance: (b, day) => model.chance(b.home.id, b.away.id, day, { rounds: b.rounds }).p, trust: trust.ml.trust, over: (b, day, line) => overChance(b, day, line)?.p ?? null, totalTrust: trust.total.trust, bets: ledger.bets, prev: prevBoard, now });
  const seen = seenUpdate(readJson(FILES.boardSeen, null), mmaBoard, now);
  const espnPriced = mmaBoard.games.filter((g) => g.k.ml?.some((s) => s.src)).length;
  const withTotal = mmaBoard.games.filter((g) => g.k.total).length;
  log.log(`${SPORT}${dry ? ' (dry)' : ''}: board of ${mmaBoard.games.length} bouts (${espnPriced} at ESPN BET's line, ${withTotal} with a round total) of ${coming.length} coming`);
  if (dry) {
    log.log(`${SPORT} (dry): ${picks.picks.length} picks: ${picks.picks.map((p) => `${p.level} ${p.pick} ${p.odds} (${p.score})`).join(' | ') || 'none'}`);
    mkdirSync(CACHE, { recursive: true });
    writeJson(path.join(CACHE, 'dry-mma.json'), { terms: model.fit.terms, totals: { terms: totals.terms, base: totals.base, backtest: bt.totals.line25 }, trust, backtest: bt.all, due: due.map((b) => `${b.home.name} vs ${b.away.name}`), unmatched, pending });
    log.log(`${SPORT} (dry): snapshot in .cache/model/dry-mma.json; nothing committed touched`);
    if (boardOut) {
      const dir = path.resolve(boardOut);
      mkdirSync(dir, { recursive: true });
      writeAtomic(path.join(dir, 'board-mma.json'), JSON.stringify(mmaBoard));
      writeAtomic(path.join(dir, 'board-seen-mma.json'), JSON.stringify(seen));
      log.log(`${SPORT} (dry): board of ${mmaBoard.games.length} bouts, ${JSON.stringify(mmaBoard).length} bytes, in ${dir}`);
    }
  } else {
    mkdirSync(path.dirname(FILES.games), { recursive: true });
    writeAtomic(FILES.games, JSON.stringify(bouts));
    writeIfChanged(FILES.state, out, dry);
    writeIfChanged(FILES.ledger, ledger, dry);
    writeIfChanged(FILES.picks, picks, dry);
    writeIfChanged(FILES.board, mmaBoard, dry);
    writeIfChanged(FILES.boardSeen, seen, dry);
  }
  log.log(`${SPORT}: ${graded} graded, ${newBets} placed, ${pending.length - newBets} tracked; record ${out.record.won}-${out.record.lost}-${out.record.push}, ${out.record.profit >= 0 ? '+' : ''}${out.record.profit}u; ${Math.round((Date.now() - t0) / 100) / 10}s`);
  return { graded, newBets, tracked: pending.length - newBets, unmatched, due: due.length };
}

// Run as a script with --seed: the league's first files from the model as kept (no odds asked, no bets)
if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '' && process.argv.includes('--seed')) {
  const now = new Date();
  const model = await buildModel({ now });
  const bt = backtest(model.rows, { now });
  mkdirSync(path.dirname(FILES.backtest), { recursive: true });
  writeAtomic(FILES.backtest, JSON.stringify(bt, null, 1));
  seedFiles(model, bt, now);
  console.log(`seeded apps/mma/src/StaticData/model (state, ledger, picks) and backtest.json: ${model.fit.n} bouts fit, held out ${bt.all.model.logLoss} vs the rating's ${bt.all.rating.logLoss}`);
}
