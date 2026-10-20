// The model desk's MMA run (run.mjs hands a fights league here: leagues.mjs LEAGUES.mma.fights): fights, not
// games, so the team machinery (ratings, context, margins, props) is left aside and the desk's shared parts are
// reused as they are: the trust path (desk.mjs fitTrust, chanceAt), the staking (stakeFor, placement), the
// timing (timing.mjs phaseOf, lastChanceOf), The Odds API (oddsapi.mjs, its credits and budget), CLV (clv.mjs),
// the picks' bands (picks.mjs) and the files the desk component and the Book read (ledger.json,
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
//   4. the moneyline's and the round totals' trust refit on the league's graded bets and closes since its epoch
//      (MMA_START) POOLED WITH THE PRICED HISTORY (2026-10-19, DECISIONS.md D36: the owner, "Do we not have historical
//      bet data on MMA?"): the gate's record writes every open and close of the history the fight model priced
//      walk-forward (gate-mma.mjs trustBets, apps/mma/scripts/model/history-rows.json: the Bot's chance, the Book's
//      no-vig, the result, the close) and the trust it fits on them (trust-prior.json). The desk reads the rows as
//      bets of its own (fitMmaTrust: desk.mjs fitTrust over both, the history's rows recency-weighted by season and
//      capped at PRIOR_ROWS rows' worth so the live bets can move the fit, the live rows at a weight of 1), so the
//      trust is fitted from the first run (no "40 graded" wait where the history has them) and the practice cap on
//      an untested market lifts only where the history says the model earned it (a trust over 0: an edge at the
//      trusted chance), staying where it hasn't (trust 0: the Book's chance, no edge, the card's practice picks
//      alone). Free to rise: the fit's grid reaches 1 and the live rows weigh whole. The desk never writes either
//      file (the gate's --record does, D22); without them the fit is the live bets' alone, as before.
//      BY LEAD BAND (the open round, 2026-10-19, D37; the owner's rule: the Bot picks its own time to bet): the
//      history's rows carry how far out they were priced, and the trust is fit a band (gate-mma.mjs leadBand: early
//      two weeks or more out, mid 48 hours to two weeks, late inside 48 hours and the close), the live bets by their
//      own lead. A bout is priced at the trust of its lead at the moment of the ask (trustFor), so the desk bets the
//      early line where the history says the Bot beats it (two weeks out: trust 0.25 to 0.3) and sits at the Book's
//      chance near the bell (trust 0). The window is four weeks (leagues.mjs TIMING.mma) and ESPN's cards are read
//      four weeks ahead (AHEAD_DAYS) for it
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
//      to apps/mma/src/StaticData/model/board.json (the Book's game view, lines.service.ts) with the prices
//      seen (board-seen.json: the play-money settler's). The prices are what the run already asked (the credit
//      rule: no ask for the board's sake): this run's Odds API lines where a bout was due, else the last board's
//      DraftKings price, else ESPN BET's line (free, marked src 'espn bet'). A bout gone from it once it starts,
//      or off. --dry with --board-out=<dir>: written there as board-mma.json, nothing committed touched
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOOK, LEAGUES, MODEL_EPOCH, TIMING } from './leagues.mjs';
import { TERMS, TOTAL_TERMS, backtest, boutSeconds, buildModel, fitRows, totalsTerms } from './fights-model.mjs';
import { TOTAL_BOOKS, TOTAL_LIVE, backtestTotals, fitTotals, liveCount, predictTotal, settleTotal, totalLinesOf, totalPickFor, totalReasonOf, totalRows } from './fights-totals.mjs';
import { weightOf } from '../../../../apps/mma/scripts/rating.mjs';
import { venueOf } from '../../../../apps/mma/scripts/fights.mjs';
import { placeOf } from './fights-venue.mjs';
import { BANDS as LEAD_BAND_KEYS, calFair, leadBand, priceKey, unpackRows } from './gate-mma.mjs';
import { BANKROLL, BUCKETS, MAX_REPRICES, PRACTICE_N, PRACTICE_SPLIT, PRACTICE_STAKED, PRACTICE_UNITS, bucketTrustOf, chanceAt, decimal, fairPair, fitBuckets, fitTrust, gapGuard, isTracked, placement, practiceRecord, practiceTop, record, rulesAt, rulesChanged, rulesOf, stakeFor, suspectOf, trackedRecord } from './desk.mjs';
import { readLinePool } from './line-pool.mjs';
import { BANDS, TOP, capOf, edgeLevel, kellyOf, levelOf, recordBlocks, scoreParts } from './picks.mjs';
import { bandOf, buildBoard, seenUpdate, skipReason } from './board.mjs';
import { clvOf, clvSummary } from './clv.mjs';
import { SHARP, american, call, canSpend, hasKey, usageSummary } from './oddsapi.mjs';
import { REPRICE_BY, lastChanceOf, phaseOf } from './timing.mjs';
import { CACHE, DAY, get, readJson, writeAtomic, writeJson } from './sources.mjs';
import { round } from './ratings.mjs';
import { logNewsItems, logPrices, mmaNewsItems } from './newslog.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const SPORT = 'mma';
// (the league's start on the desk: its trust is fit on the bets since, which is all of them)
// (bumped 2026-10-18, the venue and form round (fights-model.mjs: home, travel, form...; the live chance now
// reads each bout's weight, venue and countries): its projections changed, so its trust restarts; MODEL_EPOCH,
// the other sports', isn't touched)
// (bumped 2026-10-19, the history round (D36): the trust is fit on the priced history pooled with the live bets, so
// the price moved (the untested start of 0.5 to the history's fit) and the league's bets restart on it)
// (bumped 2026-10-20, the frames round (D56): the archive's mirrored opens repaired, the trust refit on the cleaned
// history (the early moneyline's 0.85 to 0.1), so the price moved and the league's bets restart on it)
export const MMA_START = '2026-10-20T06:30:00Z';
// (the history's rows weigh this many rows' worth at most in the trust fit, a lead band at a time (D37), the live bets
// whole: about a year of a band's rows, so a season of live bets can move the trust the history set)
export const PRIOR_ROWS = 400;
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
// (four weeks ahead since the open round (D37): the Bot's edge lives at the books' early lines, two weeks or more out)
const AHEAD_DAYS = 28;
// (a bout ESPN lists that The Odds API doesn't carry yet, this far out: asked about again after a day, not 3 hours)
const FAR_H = 14 * 24;
const REST_FAR = 24 * 36e5;
// (the band and stake rules a bet is placed under, kept on it; an open bet placed under others is taken back and
// priced again at this run's Odds API quote: rulesBack, DECISIONS.md D53)
// (MMA's own part: its trust's version, bumped when a refit changes how a bout is priced, so its open bets are priced
// again at the new trust (D53's path): 2, D56's refit on the cleaned history (early moneyline 0.85 to 0.1; the owner, 2026-10-20)
export const MMA_TRUST_RULES = 2;
export const RULES_V = `${rulesOf(BANDS)} trust${MMA_TRUST_RULES}`;
// The open bets to price again because the rules that set their band or stake changed since they were placed (D53):
// on a bout not yet locked (REPRICE_BY before its start), not priced again MAX_REPRICES times already. By the
// market and the bout's key. Each is withdrawn only once a fresh Odds API price for it is in hand (D30), then
// priced like a new bet at today's rules and that price; till then it stands as placed
export function rulesBack(bets, now, rules = RULES_V) {
  const back = { ml: new Map(), total: new Map() };
  for (const b of bets ?? []) {
    if (b.status !== 'open' || b.void || b.published) continue;
    if (Date.parse(b.start) - now.getTime() <= REPRICE_BY) continue;
    if (!rulesChanged(b, rules) || (b.repriced?.n ?? 0) >= MAX_REPRICES) continue;
    back[b.market ?? 'ml']?.set(b.boutKey, b);
  }
  return back;
}
// (a bet withdrawn for a rule change, as its new bet keeps it: the count, why, what it was (its price, band, stake))
export function withdrawnOf(bet, at, rules = RULES_V) {
  const was = rulesAt(bet);
  return {
    n: (bet.repriced?.n ?? 0) + 1,
    why: [`rule changed (placed under ${was}, now ${rules})`],
    at,
    from: { side: bet.side, line: bet.line ?? null, odds: bet.odds, units: bet.units, intent: bet.intent, band: levelOf(bet, kellyOf(bet.odds, bet.p), bet.p), p: bet.p, placedAt: bet.placedAt, rules: was },
  };
}
export const headshot = (id) => `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`;

export const FILES = {
  games: path.join(ROOT, 'apps/mma/scripts/model/games.json'),
  backtest: path.join(ROOT, 'apps/mma/scripts/model/backtest.json'),
  state: path.join(ROOT, 'apps/mma/src/StaticData/model/state.json'),
  ledger: path.join(ROOT, 'apps/mma/src/StaticData/model/ledger.json'),
  picks: path.join(ROOT, 'apps/mma/src/StaticData/model/picks.json'),
  board: path.join(ROOT, 'apps/mma/src/StaticData/model/board.json'),
  boardSeen: path.join(ROOT, 'apps/mma/scripts/model/board-seen.json'),
  // (the gate's record, read here and never written: the priced history's rows and the trust fit on them, D36)
  historyRows: path.join(ROOT, 'apps/mma/scripts/model/history-rows.json'),
  trustPrior: path.join(ROOT, 'apps/mma/src/StaticData/model/trust-prior.json'),
  rest: path.join(CACHE, 'lines-rest-mma.json'),
};

const readKept = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);

// The fair the Bot prices a moneyline from (DECISIONS.md D59): the Book's no-vig calibrated for the favorite-longshot
// bias by the gate's record (trust-prior.json ml.fairCal, fit on the priced history's closes; gate-mma.mjs calFair),
// from the fair and the line's own two prices' no-vig. The raw fair stays on the bet (its CLV and beat-the-close
// read it). setFairCal: a test's or a caller's (null: the raw fair)
let FAIR_CAL;
export const setFairCal = (cal) => {
  FAIR_CAL = cal;
};
export const fairCalOf = () => {
  if (FAIR_CAL === undefined) {
    try {
      FAIR_CAL = readKept(FILES.trustPrior, null)?.ml?.fairCal ?? null;
    } catch {
      FAIR_CAL = null;
    }
  }
  return FAIR_CAL;
};
// (the first side's priced fair from a lines entry)
export const pricedFair = (lines, cal = fairCalOf()) => calFair(lines.fair, lines.odds?.home && lines.odds?.away ? fairPair(lines.odds.home, lines.odds.away) : null, cal);
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
      // (his country: ESPN's flag for him, the fights model's home and travel terms)
      const side = (p) => ({ id: String(p.id), name: p.athlete?.displayName ?? p.name ?? '', country: p.athlete?.flag?.alt ?? null });
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
        venue: venueOf(c.venue ?? e.venues?.[0]),
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
  const body = await get(`${SITE}/scoreboard?dates=${from}-${to}&limit=400`);
  return body ? boutsOf(body) : null;
}

// The bouts kept, brought up to the board: a kept bout gone from a card the board still lists is off
// (cancelled); one whose fighters changed is off (replaced) and the new pairing kept beside it under its own
// key. Returns the kept list
// (ESPN's order of a bout's two fighters can swap between reads: the same pair the other way round is the same bout,
// turned back to the order it was kept in (orientBout), so its key, its bets' sides and their grading stay its own;
// read as a new pairing it would put the kept one off as replaced, its bets void, and price the bout again)
export function mergeBouts(kept, board, now) {
  const byKey = new Map(kept.map((b) => [b.key, b]));
  const cards = new Set(board.map((b) => b.card));
  const seen = new Set();
  for (let b of board) {
    const swapped = byKey.get(`${b.id}:${b.away.id}-${b.home.id}`);
    if (!byKey.has(`${b.id}:${b.home.id}-${b.away.id}`) && swapped) b = orientBout(b, swapped);
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
export async function espnOdds(bout, { close = false } = {}) {
  const body = await get(`${CORE}/events/${bout.card}/competitions/${bout.id}/odds?lang=en&region=us`);
  const item = body?.items?.[0];
  if (!item) return null;
  const num = (v) => {
    const n = Number(String(v ?? '').replace('+', ''));
    return Number.isFinite(n) && n ? n : null;
  };
  const read = (o) => ({ id: o?.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1] ?? null, ml: num(close ? o?.close?.moneyLine?.american : (o?.current?.moneyLine?.american ?? o?.moneyLine)) });
  const sides = [read(item.homeAthleteOdds), read(item.awayAthleteOdds)];
  const home = sides.find((s) => s.id === bout.home.id) ?? sides[0];
  const away = sides.find((s) => s.id === bout.away.id && s !== home) ?? sides.find((s) => s !== home);
  if (!home?.ml || !away?.ml) return null;
  return { odds: { home: home.ml, away: away.ml }, fair: fairPair(home.ml, away.ml), fairFrom: 'espn bet', provider: item.provider?.name ?? 'ESPN BET' };
}

// ---------------------------------------------------------------------------------------------------------
// Grading

// A bout turned to another's order of the same two fighters (a kept bout's, a bet's fighters: { home, away } by
// ESPN id): its sides and its winner swapped where its home is their away; else as it was. The sides are matched
// by id, never by place
export function orientBout(bout, to) {
  if (!bout || !to?.home?.id || !to?.away?.id) return bout;
  if (String(bout.home?.id) !== String(to.away.id) || String(bout.away?.id) !== String(to.home.id)) return bout;
  return { ...bout, home: bout.away, away: bout.home, winner: bout.winner === 'home' ? 'away' : bout.winner === 'away' ? 'home' : bout.winner };
}

// A bet's void from its bout's changes, either market's (the bout off or its fighters changed), or null
export function boutVoid(bet, bout, now) {
  if (!bout) return null;
  bout = orientBout(bout, bet.fighters);
  const changed = bout.home.id !== bet.fighters.home.id || bout.away.id !== bet.fighters.away.id;
  if (bout.off === 'replaced' || changed) return { status: 'push', profit: 0, void: true, final: 'fighter replaced', why: 'Void: a fighter was replaced' };
  if (bout.off === 'cancelled' || bout.off === 'canceled') return { status: 'push', profit: 0, void: true, final: 'bout cancelled', why: 'Void: bout cancelled' };
  if (bout.off && now - Date.parse(bet.start) > 48 * 36e5) return { status: 'push', profit: 0, void: true, final: `bout ${bout.off}`, why: `Void: bout ${bout.off}, not fought within 48 hours` };
  return null;
}

// (a final bout's length in seconds, null where ESPN gave no round: fights-model.mjs boutSeconds)
// The model's chance for a bout (fights-model.mjs buildModel chance): its rounds, weight, venue and both countries
export const boutChance = (model, bout, day) => model.chance(bout.home.id, bout.away.id, day, { rounds: bout.rounds, lbs: weightOf({ division: bout.division }).lbs, venue: bout.venue ?? null, countries: [bout.home.country ?? null, bout.away.country ?? null] });

export const boutSecs = (bout) => (bout?.final && Number.isFinite(bout.period) && bout.period > 0 ? boutSeconds({ rounds: bout.rounds, period: bout.period, clock: bout.clock }) : null);

// A bet against its bout: won, lost, or void (a draw, a no contest, the bout off or its fighters changed); a
// round total by the bout's length (fights-totals.mjs settleTotal)
export function settleBout(bet, bout, now) {
  if (!bout) return null;
  // (by the bet's fighters' ids: a bout read with its fighters the other way round graded on the bet's own side)
  bout = orientBout(bout, bet.fighters);
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

// A bout the model knows nothing of (boutChance's pred): every part of it 0, no bouts and no bio for either fighter
// (the loss review's B15: Faglier and Mahjoub, both 0-0, priced at 0.50 and tracked as the model's chance)
export const knowsNothing = (pred) => !!pred?.parts && Object.values(pred.parts).every((v) => !v);

// The pick for a bout: the better side at the trusted chance, its stake, and why it's not an edge bet if it
// isn't. model: the home side's chance; lines: { odds: { home, away }, fair (home) }
// key: the pricing key (gate-mma.mjs priceKey: 'ml', or 'mlOpen' at the early band, untapered and never gapped)
export function pickFor(model, lines, trust, { edge, untested, guard = null, apiPrice = true, key = 'ml' }) {
  const pf = pricedFair(lines);
  const sides = ['home', 'away'].map((side) => {
    const fair = side === 'home' ? lines.fair : 1 - lines.fair;
    const m = side === 'home' ? model : 1 - model;
    const odds = lines.odds[side];
    const p = chanceAt(key, side === 'home' ? pf : 1 - pf, m, trust);
    const ev = p * decimal(odds) - 1;
    return { side, odds, fair, model: m, p, ev, units: stakeFor(ev, EV_SCALE, odds) };
  });
  // (the better side by its return at the trusted chance; neither with a return (a trust at 0 prices both at the
  // Book's), the side the model leans to, so a tracked row and a practice pick are the model's side, never the
  // cheaper vig's (the loss review's B10: an anti-model side feeding the trust and CLV as the model's))
  const better = sides[0].ev > 0 || sides[1].ev > 0 ? sides[0].ev >= sides[1].ev : sides[0].model - sides[0].fair >= sides[1].model - sides[1].fair;
  const pick = better ? sides[0] : sides[1];
  const other = pick === sides[0] ? sides[1] : sides[0];
  const gap = gapGuard(key, pick.model, pick.fair);
  if (gap) return { skip: gap.why, pick, other };
  const hasEdge = pick.ev > 0 && pick.model - pick.fair >= edge && apiPrice;
  let units = untested ? Math.min(UNTESTED_MAX, pick.units) : pick.units;
  const flags = [];
  if (guard) {
    flags.push(guard);
    units = 0.5;
  }
  // (the sanity guard, desk.mjs suspectOf (D23): an edge past the bar at the practice stake, flagged loudly)
  const suspect = suspectOf(pick.ev, `p ${Math.round(pick.p * 10000) / 10000}, the Book's no-vig ${Math.round(pick.fair * 10000) / 10000}`, pick.p);
  if (suspect) {
    flags.push(`suspect: ${suspect.why}`);
    units = 0.5;
    console.warn(`mma: SUSPECT PRICE ${pick.side} at ${pick.odds}: ${suspect.why}`);
  }
  if (!apiPrice) flags.push("no Odds API price (ESPN's board)");
  const why = !apiPrice ? "no Odds API price: ESPN's board, tracked" : pick.ev <= 0 ? 'no edge at the trusted chance' : pick.model - pick.fair < edge ? `the model's lean (${round((pick.model - pick.fair) * 100, 1)} points) under the league's edge (${edge * 100})` : null;
  return { pick, other, placed: placement(hasEdge, units), flags, why, ...(suspect ? { suspect } : {}) };
}

// A card's main card: its bouts at the card's last start time (ESPN dates a card's segments, the prelims' earlier), the
// ones not off. The bout keys
export function mainCardOf(bouts, card) {
  const mine = (bouts ?? []).filter((b) => String(b.card) === String(card) && !b.off);
  const last = Math.max(...mine.map((b) => Date.parse(b.date) || 0));
  return new Set(mine.filter((b) => (Date.parse(b.date) || 0) === last).map((b) => b.key ?? b.id));
}

// The MMA's practice picks (DECISIONS.md D2, O2 closed 2026-10-18: no sport goes to zero bets). Each card plays about
// PRACTICE_N.mma: every bout clearing the vig bets as ever; of the rest with a DraftKings price and an edge before the
// vig (the trusted chance over the book's no-vig: the same fallback the props use without the correction), each
// main-card bout plays its side, and the best of the prelims by edge fill the card to PRACTICE_N.mma (the edge the
// model's own chance over the Book's no-vig, before the trust: D36). rows: this
// run's new moneyline rows ({ id, boutKey, card, intent, p, fair, priced }); placed: the card's standing moneyline
// bets (not tracked, not void). Each at PRACTICE_UNITS, a LIKE at most, marked topN; tallied apart while
// PRACTICE_SPLIT. id -> { rank, quota, slate, edge, main }
export function mmaPracticePicks(rows, bouts, placed = [], n = PRACTICE_N.mma) {
  const out = new Map();
  const byCard = new Map();
  for (const b of rows) byCard.set(String(b.card), [...(byCard.get(String(b.card)) ?? []), b]);
  for (const [card, list] of byCard) {
    const main = mainCardOf(bouts, card);
    // (the edge before the vig: the model's own chance over the Book's no-vig (D36: at a history trust of 0 the trusted
    // chance is the Book's and would pick nothing; the practice stake is the practice of the Bot's own leans))
    const cands = list.filter((b) => isTracked(b) && b.priced !== false).map((b) => ({ id: b.id, ev: -1, edge: b.model - b.fair, main: main.has(b.boutKey) }));
    const standing = placed.filter((b) => String(b.card) === String(card)).length + list.filter((b) => !isTracked(b)).length;
    const mains = cands.filter((c) => c.main && c.edge > 0).sort((a, b) => b.edge - a.edge);
    const prelims = practiceTop(cands.filter((c) => !c.main), n, standing + mains.length);
    const picked = [...mains, ...cands.filter((c) => prelims.has(c.id))].sort((a, b) => b.edge - a.edge);
    picked.forEach((c, i) => out.set(c.id, { rank: i + 1, quota: n, slate: n, edge: Math.round(c.edge * 10000) / 10000, ...(c.main ? { main: true } : {}) }));
  }
  return out;
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
  const pieces = [`The Bot gives ${bet.pick} a ${pct(bet.model)} chance against the Book's ${pct(bet.fair)} (${bet.fairFrom === 'pinnacle' ? "Pinnacle's line, the vig out" : bet.fairFrom === 'espn bet' ? "ESPN BET's line, the vig out" : "the Book's own prices, the vig out"}).`];
  if (carried.length) pieces.push(`For it: ${carried.join(', ')}.`);
  if (against.length) pieces.push(`Against it: ${against.join(', ')}.`);
  pieces.push(`The desk bets at ${pct(bet.p)} (trust ${round(bet.context?.trust ?? 0, 2)}${bet.context?.untested ? ', untested: the lean halfway' : ''}); the price needs ${pct(1 / decimal(bet.odds))} to break even.`);
  if (bet.context?.flags?.length) pieces.push(`Flagged: ${bet.context.flags.join('; ')}.`);
  return pieces.join(' ');
}

// ---------------------------------------------------------------------------------------------------------
// The betting board (board.mjs's shape: the Book's game view lists every priced bout, the picks only the
// bot's suggestions). A bout's moneyline as the board's two sides [home, away]: each at the book's price (o), the
// bot's trusted chance (c: desk.mjs chanceAt, as pickFor prices it), its Kelly score (ks) and band (b: the picks'
// bands, LIKE at the least with an edge, PASS (low) without one or past the gap guard, as boardMarkets'); src
// 'espn bet' where the price is ESPN BET's line (no DraftKings price asked or kept), else none (DraftKings').
// lines: { odds: { home, away }, fair (the home side's) }; chance: the model's chance of the home side. Held to what
// the desk would give the row (DECISIONS.md D36, board.mjs bandOf): ESPN BET's line a PASS saying so (the desk bets
// only at the Book's price: pickFor apiPrice, tracked); a side whose lean (the model's chance less the Book's no-vig)
// is under the league's edge (cfg.edge: pickFor tracks it, a card's practice pick at most) capped LIKE (cap, cr)
// key: the pricing key (gate-mma.mjs priceKey: 'ml', or 'mlOpen' at the early band, untapered and never gapped; D37)
export function boardSidesOf(lines, chance, trust, src = null, { edge = null, key = 'ml' } = {}) {
  const gap = gapGuard(key, chance, lines.fair);
  const off = src === 'espn bet' ? skipReason({ why: "ESPN BET's line, not the Book's own price: the Bot bets only at the Book's (it's tracked till then)" }) : null;
  const pf = pricedFair(lines);
  return ['home', 'away'].map((side) => {
    const fair = side === 'home' ? lines.fair : 1 - lines.fair;
    const m = side === 'home' ? chance : 1 - chance;
    const odds = lines.odds[side];
    const p = chanceAt(key, side === 'home' ? pf : 1 - pf, m, trust);
    const ev = p * decimal(odds) - 1;
    const ks = kellyOf(odds, p);
    const short = Number.isFinite(edge) && m - fair < edge ? { cap: 'medium', cr: `the Bot's lean (${round((m - fair) * 100, 1)} points) under the league's edge (${round(edge * 100, 1)}): a card's practice pick at most, a LIKE at ${PRACTICE_UNITS}u` } : {};
    const pass = !!gap || !!off;
    return { s: side, l: null, o: odds, c: round(p, 3), ks, b: bandOf(ks, p, ev, { pass, cap: short.cap }), ...(off ? { sr: off } : {}), ...(pass ? {} : short), ...(src ? { src } : {}) };
  });
}
// A bout's round total as the board's two sides [over, under] (as boardSidesOf: the book's price, the trusted chance,
// Kelly and band at its line). total: fights-totals.mjs totalLinesOf's { line, odds: { over, under }, fair (over's) };
// over: the model's chance of Over at its line. live: false till TOTAL_LIVE are graded (totalPickFor: the practice
// stake, capped LIKE); edge: the league's (a lean under it is tracked, never bet: a PASS saying so) (D36)
// key: the pricing key ('total', or 'totalOpen' at the early band; D37)
export function boardTotalOf(total, over, trust, { live = true, edge = null, key = 'total' } = {}) {
  const gap = gapGuard(key, over, total.fair);
  return ['over', 'under'].map((side) => {
    const fair = side === 'over' ? total.fair : 1 - total.fair;
    const m = side === 'over' ? over : 1 - over;
    const odds = total.odds[side];
    const p = chanceAt(key, fair, m, trust);
    const ev = p * decimal(odds) - 1;
    const ks = kellyOf(odds, p);
    const short = Number.isFinite(edge) && ev > 0 && m - fair < edge ? skipReason({ why: `the Bot's lean (${round((m - fair) * 100, 1)} points) under the league's edge (${round(edge * 100, 1)}): tracked, not bet` }) : null;
    const capped = live ? {} : { cap: 'medium', cr: `practice stake: round totals till ${TOTAL_LIVE} are graded with a close` };
    const pass = !!gap || !!short;
    return { s: side, l: total.line, o: odds, c: round(p, 3), ks, b: bandOf(ks, p, ev, { pass, cap: capped.cap }), ...(short && !gap ? { sr: short } : {}), ...(pass ? {} : capped) };
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
// nothing (no tile); chance(bout): the model's chance of the home side; trust: the moneyline's (a number, or a
// function of the bout and its start: the trust of its lead band, trustFor); bets: the ledger's
// (the bot's open side marked, as buildBoard marks it); prev: the last board (a bout no longer coming dropped). The
// round total beside it (k.total) the same way: this run's (lines' entry's total), else the last board's; over(bout,
// day, line): the model's chance of Over (null where it has none at that line); totalTrust: the totals' trust
// edge: the league's (cfg.edge), totalsLive: the round totals past TOTAL_LIVE (both the desk's caps, D36; none given, none)
export function buildMmaBoard({ bouts, lines, chance, trust, over = null, totalTrust = 0, bets = [], prev = null, now = new Date(), edge = null, totalsLive = true }) {
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
    const band = leadBand((Date.parse(start) - now.getTime()) / 36e5);
    if (Number.isFinite(p)) markets.ml = boardSidesOf(l, p, typeof trust === 'function' ? trust(bout, Date.parse(start)) : trust, src, { edge, key: priceKey('ml', band) });
    const o = t && over ? over(bout, Date.parse(start), t.line) : null;
    if (Number.isFinite(o)) markets.total = boardTotalOf(t, o, typeof totalTrust === 'function' ? totalTrust(t.line, Date.parse(start)) : totalTrust, { live: totalsLive, edge, key: priceKey('total', band) });
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

// The priced history's rows as the desk's own bets (gate-mma.mjs packRows, written by gate.mjs --record; D36): each
// a market, the Bot's walk-forward chance, the Book's no-vig, the result and the close, weighted by its season
// (unpackRows' tw) and the whole capped at PRIOR_ROWS rows' worth. { bets, at, commit, weight, n } or null without
// the file (the live bets alone then)
export function readHistoryRows(file = FILES.historyRows, { priorRows = PRIOR_ROWS } = {}) {
  const kept = readKept(file, null);
  if (!kept?.rows?.length) return null;
  const current = Number.isFinite(kept.current) ? kept.current : new Date().getUTCFullYear();
  const bets = unpackRows(kept.rows, current);
  // (the cap a market and a band: each band's rows are their own evidence (fitMmaTrust), so each is capped on its own)
  let weight = 0;
  for (const market of ['ml', 'total'])
    for (const band of LEAD_BAND_KEYS) {
      const mine = bets.filter((b) => b.market === market && b.band === band);
      const sum = mine.reduce((t, b) => t + (b.tw ?? 1), 0);
      const k = sum > priorRows ? priorRows / sum : 1;
      for (const b of mine) b.tw = round((b.tw ?? 1) * k, 4);
      weight += sum * k;
    }
  return { bets, at: kept.at ?? null, commit: kept.commit ?? null, weight: round(weight, 1), n: bets.length };
}

// The trust of both markets from the live bets since the epoch and the history's rows pooled (see the header's 4):
// { ml, total (desk.mjs fitTrust's, with history: the rows and weight behind each), ladder (the totals' rungs by the
// line's size, fitBuckets, or null), totalsGraded (the round totals graded with a close, live and history), totalsLive
// (TOTAL_LIVE reached) }. hist: readHistoryRows' (null: the live bets alone); pool: the line pool's rows
export function fitMmaTrust(ledger, hist, { pool = [], epoch = MMA_START, start = START_TRUST } = {}) {
  const since = (b) => Date.parse(b.placedAt ?? b.start) >= Date.parse(epoch);
  const live = (market) => ledger.bets.filter((b) => (b.market ?? 'ml') === market && !b.void && (b.status !== 'open' || b.clv) && since(b));
  // (each at the calibrated fair it was priced from (D59), its close's the same way)
  const cal = fairCalOf();
  const mlLive = live('ml')
    .filter((b) => b.fairFrom === 'pinnacle')
    .map((b) => ({ ...b, fair: calFair(b.fair, Number.isFinite(b.odds) && Number.isFinite(b.otherOdds) ? fairPair(b.odds, b.otherOdds) : null, cal), ...(Number.isFinite(b.clv?.q) ? { clv: { ...b.clv, q: calFair(b.clv.q, null, cal) } } : {}) }));
  const tLive = live('total');
  const hb = (market) => (hist?.bets ?? []).filter((b) => b.market === market);
  const withHistory = (f, rows) => ({ ...f, history: { rows: rows.length, weight: round(rows.reduce((t, b) => t + (b.tw ?? 1), 0), 1), at: hist?.at ?? null, commit: hist?.commit ?? null } });
  // (a live bet's band by its own lead: the start less the moment it was placed)
  const bandOf = (b) => b.band ?? leadBand((Date.parse(b.start) - Date.parse(b.placedAt ?? b.start)) / 36e5);
  // (each band's fit on its own rows, the history's and the live's; the market's own line the late band's (the
  // close's), with the bands beside it)
  const byBand = (rows, liveRows) => {
    const bands = Object.fromEntries(LEAD_BAND_KEYS.map((band) => [band, withHistory(fitTrust([...rows.filter((b) => bandOf(b) === band), ...liveRows.filter((b) => bandOf(b) === band)].map((b) => ({ ...b, market: priceKey(b.market, band) })), start), rows.filter((b) => bandOf(b) === band))]));
    return { ...bands.late, bands, history: withHistory({}, rows).history };
  };
  const ml = byBand(hb('ml'), mlLive);
  const tRows = hb('total');
  let total = byBand(tRows, tLive);
  let ladder = null;
  try {
    const mine = [...tLive.filter((b) => Number.isFinite(b.line)), ...tRows.filter((b) => Number.isFinite(b.line))];
    ladder = fitBuckets([...pool, ...mine], mine, () => 'total', ['total']);
    total = { ...total, lines: ladder.keys.total };
  } catch {
    ladder = null;
  }
  const histClosed = tRows.filter((b) => (b.status === 'won' || b.status === 'lost') && Number.isFinite(b.clv?.q)).length;
  const totalsGraded = liveCount(ledger.bets, epoch) + histClosed;
  return { ml, total, ladder, totalsGraded, totalsLive: totalsGraded >= TOTAL_LIVE, live: { ml: mlLive.length, total: tLive.length } };
}

// A market's trust at a moment: its band's by the lead (hours before the start), held to the rung by the line's size
// for a total (bucketTrustOf); a trust with no bands (a state from before them) its own
export function trustFor(trust, market, lead, line = null) {
  const t = trust?.[market];
  const band = leadBand(lead);
  const own = Number.isFinite(t?.bands?.[band]?.trust) ? t.bands[band].trust : t?.trust ?? START_TRUST;
  if (market !== 'total') return own;
  const rung = t?.lines?.[lineBucketOf(line)]?.trust;
  return Math.min(own, Number.isFinite(rung) ? rung : own);
}
const lineBucketOf = (line) => (!Number.isFinite(line) ? 'high' : line <= 1.5 ? 'low' : line <= 3.5 ? 'mid' : 'high');
// (whether a market's trust at a lead is fitted: its band's)
export const fittedFor = (trust, market, lead) => !!(trust?.[market]?.bands?.[leadBand(lead)]?.fitted ?? trust?.[market]?.fitted);

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

// The picks file: the open edge bets on bouts not started, by their Kelly score, every one (D27); each published
// once locked (REPRICE_BY before the start), its chance, score and band fixed when first shown; the published
// record by band. The rows as picks.mjs buildPicks makes them, for the Book
export function buildFightPicks(ledger, trust, bouts, now, extra = {}) {
  const locked = (b) => Date.parse(b.start) - now.getTime() <= REPRICE_BY;
  for (const b of ledger.bets) {
    if (b.shown && !b.published && locked(b)) {
      Object.assign(b, { published: true, publishedAt: now.toISOString() });
      delete b.shown;
    }
  }
  // (every bet it placed, a guard's 0.5u cut one too, and all of them: picks.mjs buildPicks, D27)
  const open = ledger.bets.filter((b) => b.status === 'open' && Date.parse(b.start) > now.getTime() && !isTracked(b));
  const scored = open.map((b) => {
    const { score, ...why } = scoreParts(b, trust);
    return { b, score, why };
  });
  scored.sort((x, y) => y.score - x.score || x.b.start.localeCompare(y.b.start));
  const top = scored;
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
    // (the rule's cap on its band, picks.mjs capOf (picks.json cap): a suspect early-band price a LIKE at its Kelly's
    // LOVE, so the page's row (book-rows.ts rowOf) bands it as the desk does)
    ...(capOf(b) ? { cap: capOf(b) } : {}),
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
  // (the record and the recent form: the replayed record before MMA_START joined to the live ledger since, picks.mjs
  // recordBlocks, in the page's shape (wins, losses, pushes, profit: the Book's band headers read it))
  return { sport: SPORT, at: now.toISOString(), bands: BANDS, top: TOP, ...recordBlocks(SPORT, ledger, now, { epoch: MMA_START, ...extra }), picks, checks: [] };
}

// The state the desk component reads (desk-model.ts ModelState: a fights league has no teams, no team params)
export function stateOf(state, { model, bt, trust, ledger, now, lines = null, odds = null, totals = null, totalsGraded = null, prior = null }) {
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
    // (the cards' practice picks' own line while PRACTICE_SPLIT (desk.mjs, mmaPracticePicks): out of the record above)
    practiceSplit: PRACTICE_SPLIT,
    practice: practiceRecord(ledger.bets),
    tracked: trackedRecord(ledger.bets),
    clv: { all: clvSummary(ledger.bets), ml: clvSummary(ledger.bets.filter((b) => b.market === 'ml')), total: clvSummary(ledger.bets.filter((b) => b.market === 'total')) },
    // (the round totals (fights-totals.mjs): the fit's terms and base rates, held out against the base rates, and
    // how near the market is to live (tracked only till TOTAL_LIVE graded with a close))
    totals: totals ? { terms: totals.terms, base: totals.base, rows: totals.n, from: totals.from, to: totals.to, labels: Object.fromEntries(TOTAL_TERMS), test: bt?.totals ? { line25: bt.totals.line25, all: bt.totals.all, byDivision: bt.totals.byDivision } : null, live: (totalsGraded ?? liveCount(ledger.bets, MMA_START)) >= TOTAL_LIVE, graded: totalsGraded ?? liveCount(ledger.bets, MMA_START), liveAt: TOTAL_LIVE } : state.totals ?? null,
    // (the priced history's trust prior as the gate recorded it (trust-prior.json, D36): the page's readout of what
    // the history says of the model by market, and the match rate)
    historyTrust: prior ? { at: prior.at ?? null, commit: prior.commit ?? null, ml: prior.ml ?? null, total: prior.total ?? null, match: prior.match ?? null } : state.historyTrust ?? null,
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

// The price log's rows for this run's prices (newslog.mjs, D54): each bout's moneyline (ml: a, b the home and away
// prices; src 'o' The Odds API's, 'e' ESPN BET's), Pinnacle's no-vig chance where it set the fair one (pin:ml, the
// home side's), the round total (total: line, over, under) and its Pinnacle chance (pin:total)
export function mmaPriceRows(linesNow, bouts) {
  const byKey = new Map((bouts ?? []).map((b) => [b.key, b]));
  const rows = [];
  const games = new Map();
  const n = (v) => (Number.isFinite(v) ? v : null);
  for (const [key, x] of linesNow ?? []) {
    const bout = byKey.get(key);
    if (!bout) continue;
    const game = String(bout.id);
    games.set(game, { start: bout.start ?? bout.date, m: `${bout.away?.name ?? '?'} vs ${bout.home?.name ?? '?'}` });
    const src = x.src === 'espn bet' ? 'e' : 'o';
    if (x.lines?.odds) {
      rows.push({ game, key: 'ml', line: null, a: n(x.lines.odds.home), b: n(x.lines.odds.away), src });
      if (x.lines.fairFrom === 'pinnacle' && Number.isFinite(x.lines.fair)) rows.push({ game, key: 'pin:ml', line: null, a: Math.round(x.lines.fair * 1e4) / 1e4, b: null, src });
    }
    if (x.total?.odds) {
      rows.push({ game, key: 'total', line: n(x.total.line), a: n(x.total.odds.over), b: n(x.total.odds.under), src: 'o' });
      if (/pinnacle/i.test(x.total.fairFrom ?? '') && Number.isFinite(x.total.fair)) rows.push({ game, key: 'pin:total', line: n(x.total.line), a: Math.round(x.total.fair * 1e4) / 1e4, b: null, src: 'o' });
    }
  }
  return { rows, games };
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
    const pred = boutChance(model, bout, day);
    const t = predictTotal(totals, totalsTerms(pred.a, pred.b, { ...weightOf({ division: bout.division }), place: placeOf(bout.venue), date: new Date(day).toISOString().slice(0, 10), rounds: bout.rounds }), line, bout.rounds, bout.division);
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
    // (ESPN's close once the bout is over, never its current, an in-bout line)
    else if (bout && !bout.final && bet.market !== 'total') continue;
    else if (bout && bet.market !== 'total') {
      const espn = await espnOdds(bout, { close: true }).catch(() => null);
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

  // 4. the trust: the live bets since the epoch pooled with the priced history's rows (fitMmaTrust, D36)
  const trust = { ...(state.trust ?? {}) };
  const hist = readHistoryRows();
  const fit = fitMmaTrust(ledger, hist, { pool: readLinePool(ROOT, MODEL_EPOCH, 'mma') });
  const evidenceOf = (f, what) => `best fit to ${f.n} graded ${what} and ${f.clvN} closing lines (log loss ${f.logLoss}${f.history?.rows ? `; the priced history's ${f.history.rows} rows at ${f.history.weight} rows' worth, the gate's record ${String(f.history.at ?? '').slice(0, 10)}` : ''})`;
  if (trust.ml && trust.ml.trust !== fit.ml.trust) changelog(state, at, 'moneyline trust in the model', trust.ml.trust, fit.ml.trust, evidenceOf(fit.ml, 'moneyline bets'));
  trust.ml = fit.ml;
  // (the round totals' own: every total row graded or closed, whichever book anchored it (they start 2026-10-17),
  // and the history's; staked once TOTAL_LIVE are graded with a close, the history's counted)
  if (trust.total && trust.total.trust !== fit.total.trust) changelog(state, at, 'round totals trust in the model', trust.total.trust, fit.total.trust, evidenceOf(fit.total, 'round totals'));
  trust.total = fit.total;
  // (the round totals' trust by the line's size, as a prop's (desk.mjs fitBuckets, 2026-10-18): 1.5 rounds or under
  // low, 2.5 and 3.5 mid, 4.5 high; each bucket's rung pulled toward the MMA's, the MMA's toward every sport's
  // counted lines pooled (line-pool.mjs), the pool's toward the bucket's start, each by its own evidence; priced at
  // the rung held to the totals' own trust (bucketTrustOf). Any failure: the bucket's start, held to the trust
  if (fit.ladder) {
    state.lineTrust = { pool: fit.ladder.pool, sport: fit.ladder.sport };
    log.log(`${SPORT}: round totals' line trust: ${BUCKETS.map((bk) => `${bk} ${fit.ladder.keys.total[bk].trust} (pool ${fit.ladder.pool[bk].trust}, eff ${fit.ladder.pool[bk].eff})`).join('; ')}`);
  } else log.log(`${SPORT}: round totals' line trust left out this run`);
  log.log(`${SPORT}: trust by lead band, ml ${LEAD_BAND_KEYS.map((b) => `${b} ${trust.ml.bands?.[b]?.trust ?? '-'}`).join(' / ')}, totals ${LEAD_BAND_KEYS.map((b) => `${b} ${trust.total.bands?.[b]?.trust ?? '-'}`).join(' / ')}: ${fit.live.ml} live moneyline rows and ${fit.live.total} totals since the epoch${hist ? `, the history's ${hist.n} rows at ${hist.weight} rows' worth (the gate's record of ${String(hist.at ?? '').slice(0, 10)}, ${hist.commit})` : ', no history rows (the gate has not recorded them)'}`);
  const totalsLive = fit.totalsLive;
  if (totalsLive && !state.totalsLiveAt) {
    state.totalsLiveAt = at;
    changelog(state, at, 'round totals staked', 0, 1, `${TOTAL_LIVE} round totals graded with a close (${fit.totalsGraded}, the history's counted): the market leaves the practice stake for the trust path`);
  }

  // 5. the bouts due, priced
  // (each market's rows apart: the moneyline's and the round total's, one of each a bout)
  const rowsOf = (market, pred) => ledger.bets.filter((b) => (b.market ?? 'ml') === market && pred(b));
  const placedOn = new Set(rowsOf('ml', (b) => b.status === 'open' || b.gradedAt).map((b) => b.boutKey));
  const openOn = new Map(rowsOf('ml', (b) => b.status === 'open').map((b) => [b.boutKey, b]));
  const tPlacedOn = new Set(rowsOf('total', (b) => b.status === 'open' || b.gradedAt).map((b) => b.boutKey));
  const tOpenOn = new Map(rowsOf('total', (b) => b.status === 'open').map((b) => [b.boutKey, b]));
  // (the open bets placed under rules changed since (D53): due again, withdrawn below at a fresh quote)
  const back = rulesBack(ledger.bets, now);
  const withdrawn = [];
  const withdraw = (old, bout) => {
    const re = withdrawnOf(old, at);
    withdrawn.push({ old, re, bout });
    ledger.bets = ledger.bets.filter((b) => b !== old);
    return re;
  };
  if (back.ml.size || back.total.size) log.log(`${SPORT}: ${back.ml.size + back.total.size} open bets placed under changed rules (now ${RULES_V}), to price again at a fresh quote: ${[...back.ml.values(), ...back.total.values()].map((b) => `${b.pick} ${b.odds > 0 ? '+' : ''}${b.odds} ${b.units}u (${rulesAt(b)})`).join(', ')}`);
  // (a row placed: its price read again inside 3 hours of the start, for the close; none yet: due unless resting)
  // (by the bout's own start, not its card's: a card's later bouts start hours after its date, so a price read near
  // the card's start was never within 3 hours of theirs, and their rows had no close (the loss review's B1: the
  // round totals of 2026-10-17 none); a bout whose card has started, still to fight, asked about for its close alone)
  const startOf = (b) => Date.parse(b.start ?? b.date);
  const closeDue = (open, b) => !!open && startOf(b) - now.getTime() <= SEEN_CLOSE && !(open.seen && startOf(b) - Date.parse(open.seen.at) <= SEEN_CLOSE);
  const closing = bouts.filter((b) => !b.final && !b.off && !coming.includes(b) && startOf(b) > now.getTime() && (openOn.has(b.key) || tOpenOn.has(b.key)));
  const resting = (k, wait) => !!rest[k] && now.getTime() - Date.parse(rest[k]) < wait;
  const dueFor = new Map();
  const due = [...coming, ...closing].filter((b) => {
    const until = Date.parse(b.date) - now.getTime();
    const started = !coming.includes(b);
    if (!started && phaseOf(SPORT, 'lines', until, gap) === 'early') return false;
    const ml = back.ml.has(b.key) && !started ? true : placedOn.has(b.key) ? closeDue(openOn.get(b.key), b) : !started && !resting(b.key, REST_FOR);
    // (a round total the book hadn't posted waits TOTAL_REST before it's asked about again: the totals post later
    // than the moneylines, and the ask's for the whole board)
    const total = back.total.has(b.key) && !started ? true : tPlacedOn.has(b.key) ? closeDue(tOpenOn.get(b.key), b) : !started && !resting(`${b.key}|total`, TOTAL_REST);
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
      } else {
        unmatched.push(`${bout.home.name} vs ${bout.away.name} (${bout.cardName})`);
        // (a bout two weeks or more out the API doesn't list yet: a day's rest, not 3 hours: the ask is for the board)
        if (until >= FAR_H * 36e5) rest[bout.key] = new Date(now.getTime() + REST_FAR - REST_FOR).toISOString();
      }
    }
    const start = bout.start ?? bout.date;
    if (lines) addLines(bout.key, { lines, src: apiPrice ? null : 'espn bet' });
    // (the round total, from the same event: an open row's price kept for its close (at its own line only), else
    // priced and tracked (fights-totals.mjs: tracked only till TOTAL_LIVE graded with a close))
    const tl = m ? totalLinesOf(m.ev) : null;
    if (tl) addLines(bout.key, { total: tl });
    let tOpen = tOpenOn.get(bout.key);
    // (an open total placed under changed rules, with a fresh Odds API price in hand: withdrawn, priced again below)
    let tRe = null;
    if (tOpen && back.total.get(bout.key) === tOpen && tl) {
      tRe = withdraw(tOpen, bout);
      tOpen = null;
    }
    if (tOpen) {
      // (at whatever line the book has now: a moved line's close is carried or left out by clv.mjs, never dropped)
      if (tl) tOpen.seen = { at, line: tl.line, odds: tl.odds[tOpen.side], fair: round(tOpen.side === 'over' ? tl.fair : 1 - tl.fair, 4) };
    } else if (want.total && (tRe || !tPlacedOn.has(bout.key))) {
      const tp = tl ? overChance(bout, Date.parse(start), tl.line) : null;
      const tLead = (Date.parse(start) - now.getTime()) / 36e5;
      const choice = tp ? totalPickFor(tp.p, tl, trustFor(trust, 'total', tLead, tl.line), { live: totalsLive, untested: !fittedFor(trust, 'total', tLead), edge: cfg.edge, key: priceKey('total', leadBand(tLead)) }) : null;
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
          context: { division: bout.division, rounds: bout.rounds, cardName: bout.cardName, parts: tp.parts, base: tp.base, trust: trustFor(trust, 'total', tLead, tl.line), band: leadBand(tLead), untested: !fittedFor(trust, 'total', tLead), live: totalsLive, flags: [], ...(why ? { why } : {}) },
          seen: { at, line: tl.line, odds: pick.odds, fair: round(pick.fair, 4) },
          rules: RULES_V,
          ...(tRe ? { repriced: tRe } : {}),
          status: 'open',
          profit: 0,
        });
      }
    }
    // (the moneyline: only where it's due itself)
    if (!want.ml) continue;
    // (an open bet placed under changed rules, with this run's Odds API price for it: withdrawn and priced again
    // below at today's rules and that price (D53); without a fresh price it stands as placed)
    let re = null;
    if (open && back.ml.get(bout.key) === open && apiPrice) re = withdraw(open, bout);
    // (an open bet: its latest price kept for the close, nothing else)
    if (open && !re) {
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
    const pred = boutChance(model, bout, day);
    // (nothing known of either fighter: unpriced, no row; a coin's 0.5 is no chance of the model's own)
    if (knowsNothing(pred)) {
      log.log(`${SPORT}: ${bout.home.name} vs ${bout.away.name} unpriced: nothing known of either fighter (every part of the model 0)`);
      rest[bout.key] = at;
      continue;
    }
    // (the first price seen on the bout: the guard's reference, and the opening line kept for a later fit)
    state.opens ??= {};
    state.opens[bout.key] ??= { at, fair: round(lines.fair, 4), odds: lines.odds };
    const openFair = state.opens[bout.key].fair;
    // (the trust of this moment's lead band (D37): the early line where the Bot beats it, the Book's chance near the bell)
    const lead = (day - now.getTime()) / 36e5;
    const tMl = trustFor(trust, 'ml', lead);
    const mlKey = priceKey('ml', leadBand(lead));
    const untested = !fittedFor(trust, 'ml', lead);
    const sideOf = (s) => (s === 'home' ? 1 : -1);
    let guard = null;
    const choice = pickFor(pred.p, lines, tMl, { edge: cfg.edge, untested, apiPrice, key: mlKey });
    if (choice.skip) {
      log.log(`${SPORT}: ${bout.home.name} vs ${bout.away.name} skipped: ${choice.skip}`);
      rest[bout.key] = at;
      continue;
    }
    // (the market's move against the pick since the first price seen, in its side's fair chance)
    const move = round(sideOf(choice.pick.side) * (openFair - lines.fair), 4);
    if (cfg.guard.ml && move <= -cfg.guard.ml) guard = `line moved ${move} against it since it opened`;
    const final = guard ? pickFor(pred.p, lines, tMl, { edge: cfg.edge, untested, apiPrice, guard, key: mlKey }) : choice;
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
      ...(final.suspect ? { suspect: final.suspect, ...(placed.intent === 'edge' ? { practice: `suspect: ${final.suspect.why}` } : {}) } : {}),
      ...(apiPrice ? {} : { priced: false }),
      book: 'DraftKings',
      fairFrom: lines.fairFrom,
      pick: pick.side === 'home' ? bout.home.name : bout.away.name,
      context: { division: bout.division, rounds: bout.rounds, cardName: bout.cardName, parts: pred.parts, ratingP: pred.ratingP, trust: tMl, band: leadBand(lead), lead: round(lead, 1), untested, flags, move, ...(guard ? { guard } : {}), ...(why ? { why } : {}), records: { home: pred.a.record, away: pred.b.record } },
      seen: { at, odds: pick.odds, fair: round(pick.fair, 4), open: state.opens[bout.key] },
      rules: RULES_V,
      ...(re ? { repriced: re } : {}),
      status: 'open',
      profit: 0,
    };
    pending.push(bet);
  }
  if (unmatched.length) log.warn(`${SPORT}: ${unmatched.length} due bouts not on The Odds API's board by name (not guessed): ${unmatched.join('; ')}`);
  // (the card's practice picks (mmaPracticePicks, D2): the main card's bouts and the best prelims short of the vig
  // with an edge before it, at the practice stake, marked topN)
  const mlNew = pending.filter((b) => b.market === 'ml');
  const forced = !PRACTICE_STAKED ? new Map() : mmaPracticePicks(mlNew, bouts, ledger.bets.filter((b) => (b.market ?? 'ml') === 'ml' && !b.void && !isTracked(b) && b.card));
  for (const b of mlNew) {
    const t = forced.get(b.id);
    if (!t) continue;
    delete b.trackUnits;
    Object.assign(b, { intent: 'edge', units: PRACTICE_UNITS, topN: t, practice: `practice: its card's #${t.rank} of ${t.quota}${t.main ? ' (main card)' : ''} by edge before the vig (+${Math.round(t.edge * 1000) / 10} points over the Book's no-vig), short of the vig` });
  }
  if (forced.size) log.log(`${SPORT}${dry ? ' (dry)' : ''}: the card's practice picks: ${forced.size} (${PRACTICE_N.mma} a card, every main-card bout with an edge before the vig, at ${PRACTICE_UNITS}u): ${mlNew.filter((b) => forced.has(b.id)).map((b) => `${b.pick} ${b.odds > 0 ? '+' : ''}${b.odds} +${forced.get(b.id).edge}`).join(', ')}`);
  for (const b of pending) {
    log.log(`${SPORT}${dry ? ' (dry)' : ''}: ${isTracked(b) ? 'tracked ' : ''}${b.matchup}: ${b.pick} ${b.odds > 0 ? '+' : ''}${b.odds} ${isTracked(b) ? `0u (${b.trackUnits}u as an action bet; ${b.context.why})` : `${b.units}u ${levelOf(b, kellyOf(b.odds, b.p), b.p)}`} model ${b.model} fair ${b.fair} (${b.fairFrom}) p ${b.p} ev ${b.ev}${b.context.flags.length ? ` [${b.context.flags.join('; ')}]` : ''}`);
    ledger.bets.push(b);
  }
  // (the bets withdrawn for a rule change and what took their place, both prices (D53): logged, in the changelog)
  for (const { old, re, bout } of withdrawn) {
    const now2 = pending.find((b) => b.boutKey === bout.key && (b.market ?? 'ml') === (old.market ?? 'ml'));
    const was = `${old.pick} ${old.odds > 0 ? '+' : ''}${old.odds} ${old.units}u ${re.from.band}`;
    const is = now2 ? `${now2.pick} ${now2.odds > 0 ? '+' : ''}${now2.odds} ${now2.units}u ${isTracked(now2) ? 'tracked' : levelOf(now2, kellyOf(now2.odds, now2.p), now2.p)}` : 'not placed again (no row this run)';
    log.log(`${SPORT}${dry ? ' (dry)' : ''}: rule changed: ${old.matchup}: withdrawn ${was}, now ${is}`);
    changelog(state, at, `Open bet priced again: rule changed (${old.matchup})`, was, is, re.why[0]);
  }
  const newBets = pending.filter((b) => !isTracked(b)).length;
  log.log(`${SPORT}: ${newBets} bets placed, ${pending.length - newBets} tracked`);
  if (!dry) writeJson(FILES.rest, Object.fromEntries(Object.entries(rest).filter(([, t]) => now.getTime() - Date.parse(t) < DAY)));

  // 6. the picks, the state, the files
  const boutsById = new Map(bouts.map((b) => [b.id, b]));
  const picks = buildFightPicks(ledger, trust, boutsById, now);
  const out = stateOf(state, { model, bt, trust, ledger, now, lines: linesSource, odds: hasKey() ? usageSummary() : null, totals, totalsGraded: fit.totalsGraded, prior: readKept(FILES.trustPrior, null) });
  // 7. the betting board: every bout coming, priced from what the run has; a bout with no DraftKings price this run or
  // on the last board takes ESPN BET's line (free, src 'espn bet'), read again each run till a DraftKings price comes
  const prevBoard = readJson(FILES.board, null);
  for (const bout of coming) {
    if (linesNow.get(bout.key)?.lines || boardLinesOf(prevBoard, bout.id)) continue;
    const espn = await espnOdds(bout).catch(() => null);
    if (espn) addLines(bout.key, { lines: espn, src: 'espn bet' });
  }
  const mmaBoard = buildMmaBoard({ bouts, lines: linesNow, chance: (b, day) => boutChance(model, b, day).p, trust: (b, day) => trustFor(trust, 'ml', (day - now.getTime()) / 36e5), over: (b, day, line) => overChance(b, day, line)?.p ?? null, totalTrust: (line, day) => trustFor(trust, 'total', (day - now.getTime()) / 36e5, line), bets: ledger.bets, prev: prevBoard, now, edge: cfg.edge, totalsLive });
  const seen = seenUpdate(readJson(FILES.boardSeen, null), mmaBoard, now);
  // (the price log, D54: every price this run read, by the bout, only what changed since and a heartbeat a bout;
  // logging only, nothing above reads it; --dry counts and writes nothing)
  const priced = mmaPriceRows(linesNow, bouts);
  const pl = logPrices(SPORT, priced.rows, { now, games: priced.games, dry });
  const pxOf = (ev) => {
    const mine = priced.rows.filter((x) => x.game === String(ev));
    if (!mine.length) return null;
    const px = { src: mine.find((x) => x.key === 'ml')?.src ?? 'o' };
    for (const x of mine) px[x.key.replace('pin:', 'pin_')] = x.key === 'ml' ? [x.a, x.b] : x.key.startsWith('pin:') ? x.a : [x.line, x.a, x.b];
    return px;
  };
  const nl = logNewsItems(SPORT, mmaNewsItems(bouts.filter((b) => !b.final), now), { now, dry, px: pxOf });
  log.log(`${SPORT}${dry ? ' (dry)' : ''}: the news log ${nl.n} new of ${nl.seen} read`);
  log.log(`${SPORT}${dry ? ' (dry)' : ''}: the price log ${pl.n} changed of ${pl.seen} prices, ${pl.beats} bouts' heartbeats, ${pl.bytes} bytes${dry ? ' (dry: not written)' : ''}`);
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
