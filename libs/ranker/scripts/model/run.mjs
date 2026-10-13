// The model desk: code only, no AI, free. For each sport, every run:
//
//   1. the game history kept current (apps/<sport>/scripts/model/games.json, a game a line: two seasons of
//      finals from the teams' schedules the first time, then the last few days' scoreboards)
//   2. the ratings refit on it (ratings.mjs: the grid's best settings at predicting the games they hadn't
//      seen yet), each setting that moves logged with why
//   2b. the context (context.mjs: rest, travel, starters, weather, officials and more) gathered for every game, and the size of
//      each of its terms fit on the same held-out games (ratings.mjs fitContext: a term that doesn't help is
//      left out), each size that moves logged the same way
//   3. each market's trust in the model refit on the desk's own graded bets (a game bet's only when its fair
//      chance was Pinnacle's: none on DraftKings' own prices), logged the same way. The backtest's bets it
//      starts from are at the close (backtest.mjs), counting BACKTEST_WEIGHT each (the replay that prices them
//      was fit on the same seasons: its settings chose themselves on those games, so its edge there is
//      flattered), and the live ones are now placed near the news too (5); a
//      live bet placed well before its window (EARLY_SLACK past it: from before the desk waited for the news,
//      priced on a guess at who'd play) counts at EARLY_WEIGHT (desk.mjs fitTrust tw)
//   4. the open bets graded against their finals (a prop whose count can't be read yet waits, PROP_WAIT at most;
//      a player who played but isn't in his stat's table counts 0; an MLB game cut short voids its run line and
//      total; each prop's count read again once a day and a half after the start, a stat correction noted on
//      the bet but not graded again: the book settles on the count at the final)
//   4b. the open bets priced again whose inputs changed (timing.mjs inputsOf: each side's injury report, the
//      starters, the goalies, the lineups, as the bet saw them against what the run sees now) on games more than
//      REPRICE_BY from the start: taken back and placed again below with what the model knows now, logged in
//      the changelog (at most MAX_REPRICES a bet, counted across runs; a part unread this run, its source
//      failed, isn't a change). A pick the Bets page shows is priced again like any other: it's published only
//      once it's locked, REPRICE_BY before the start (picks.mjs), so the published record is of the bets as
//      they stood at the start. (The counts toward MAX_REPRICES of bets taken back and not yet placed again,
//      the props' asks of The Odds API and the rests live in .cache/model, which the workflow restores only
//      from a run that succeeded: a failed run's are lost, the counts start over; accepted, the ledger keeps
//      each placed bet's own count)
//   5. every market (spread, total, moneyline) of every coming game bet once, when it's due (leagues.mjs TIMING:
//      inside its sport's window, once the news it waits for is in, or inside the last chance with what's
//      known, flagged at the minimum; before the window nothing's priced: the bets wait for the news rather
//      than being locked in days ahead; the last chance stretched to 1.5 times the recent gap between runs
//      when they come further apart than it, timing.mjs cadenceOf: a game the next run would likely see only
//      after its start is bet now), the better side at 0.5 to 3 units by its Kelly fraction (desk.mjs;
//      priced off the margins' own chances, margins.mjs, their shape fit on the history in 2b) when it has an
//      edge (every bet a LIKE or better, picks.mjs BANDS); with none, or cut by the guard (a line moved a
//      lot against it since it opened, a key player questionable: what was cut to 0.5), tracked, not bet
//      (desk.mjs TRACK: units 0, graded and learned from like a bet, never in the record; since 2026-10-13,
//      the old action bets placed for the data); skipped when its line moved twice the guard's limit, or the model's
//      chance is too far from the book's (desk.mjs GAP); the spread and the moneyline never on one side of a
//      game; each bet keeps the context it saw. Held for a later run (fail safe): a game whose injury report
//      or context couldn't be read (or, the NFL's, its nflverse row: its quarterbacks unseen), one starting
//      within five minutes, one called off, and with The Odds API to
//      hand one it didn't price (till LAST_CALL)
//   6. the props (below), then every new bet placed, each game's open stake, markets and props together, at
//      most GAME_CAP (leagues.mjs; desk.mjs capGame: a tracked row stakes nothing, always kept), an earlier
//      run's action bets on the game (from before they were tracked) taken back to make room for this run's
//      edge bets (desk.mjs makeRoom); before the cap, a game's edge props sized jointly with its other props,
//      this run's and the ones open (desk.mjs sizeJointly: the same-game correlations, a player's own props' and
//      the rest of a game's, fit on the graded props, tracked rows among them as evidence, and each used only
//      where held-out days bore it out, sameGameOf; stakes only, never one raised; a tracked row stakes nothing,
//      so it's no exposure; all three in desk.mjs placeGame)
//   6c. the CHECKs (checks.mjs): a market or prop skipped only for the model's distance from the book (the
//      gap guard alone: not one another guard skips too) isn't bet, but kept apart from the bets in their own
//      file (model/checks.json, read in as ledger.checks: no units, never in the record, the trust fit, the
//      caps or the CLV) on the model's side, written again while it isn't locked and something material
//      changed, closed once a run prices its market and the gap guard doesn't skip it, listed in picks.json
//      apart from the picks (checks: the Bets page shows only the picks), and graded as a bet would be once
//      final (4c: checkResult). Only the ones worth a person's look are shown (checks.mjs shadowOf: a role's at
//      a model Kelly of CHECK_KELLY or more, the news's); the gap's and a small role's a PASS kept as a shadow
//      (hidden, passAs), graded the same but out of the page, the board's marks, the research, the notes, the
//      re-pricing and the tallies but their own (byPassAs); one shown that turns a shadow passed, its price
//      frozen (checks.mjs upsertCheck), the stored ones judged the same at the run's start (rejudgeChecks: one
//      from before the rule, or one no run prices again). The owner's notes on them (notes.mjs: Firestore's deskNotes,
//      read with the FIREBASE_SERVICE_ACCOUNT secret, none without it; on a CHECK or a bet) are kept on
//      the CHECKs (their reason, player, status and when alone: notes.mjs publicNote; the words and the
//      writer's uid stay in Firestore, never in a served or committed file), and a note's concrete news (a
//      player out, questionable or active) goes into its game's injury report for the pricing (2b), so the
//      market may come back as a real bet, or an open bet on it is priced again (a note on a prop CHECK owes its
//      game one more ask of The Odds API's props the first run it's seen, or edited: PROP_ASKS a game at most;
//      a note on a bet or a game market's CHECK owes none). A prop CHECK with no fresh price this run (the
//      NFL's board has none; The Odds API not asked for its game) is priced from its own stored prices while
//      its line is still the board's (checks.mjs withStoredPrices), its projection and guards run again: still a
//      CHECK, closed, or bet (with The Odds API to hand, only at a price STORED_FRESH old or less); an owner's
//      note on it answered the same way the next run (its line moved, its game owed an ask), and how it came out
//      kept on it (resolved: checks.mjs resolveChecks); one off a board still showing his market (the book
//      pulled it) never bet from its stored price (storedBet), and a noted one the run couldn't re-price
//      answered still with why (held). A checks.json there but unreadable (checks-file.mjs
//      readChecks): a GitHub warning, and the CHECKs' list, file, tally (state.json's checks), picks.json's
//      list and write-ups all left as they were till a person mends it; no CHECK recorded meanwhile. Each
//      CHECK diagnosed as it's made (check-learn.mjs diagnose: the part of the projection that drives the gap,
//      with its numbers), and the graded ones' hit rate and profit by cause turned into ranked
//      recommendations (checkLearning: a blind spot to fix, a guard that could loosen, recorded, never
//      applied by the desk) in state.json's checks.learning. With CHECK_RESEARCH=1 and an Anthropic key (never
//      --dry), the day's biggest CHECKs researched in the news (research.mjs, under ai-budget.mjs's caps, 90
//      seconds a request and 3 minutes a run), a finding kept on its CHECK as a label only: never put into the
//      injury report, the prices or a bet (the owner's note does that, where it's right). The teams' news
//      (news.mjs: ESPN's free per-team feed, once a UTC day a team, a game's two teams every 3 hours from 36
//      before it, cached; no AI): a story on a change of play-caller, coordinator or head coach, or a benching,
//      flags its team's unit for its next 2 games, an owner's note with no player (reason news) its team for
//      the game (notes.mjs teamNotes): the unit's props CHECKs either side (cause 'news', the headline the
//      reason), the game's lines at the minimum stake, an open bet on it priced again (2b: teamNews)
//   6d. the line log (linelog.mjs): every line the run saw (ESPN's game lines for every coming game, The Odds
//      API's where bought, every prop on a board it read, the closing boards and lines captureClose reads after the
//      start, src 'c'), each market's
//      row appended only when it's new or its line or a price changed, to .cache/model/lines (a gzip member a
//      run, a month's file a sport): the lines' history for the fits to come. --dry counts them, writes nothing
//
// What it writes (apps/<sport>/src/StaticData/model/): state.json (the settings, their test numbers, the
// changelog, the teams' ratings, the context's sizes) and ledger.json (every bet, open or graded), each only
// when something in it changed (a run that learned nothing new commits nothing); and the facts the context is
// built from, in .cache/model/context-<sport>.json (gitignored: a cache, rebuilt from the sources when lost).
// The Bets page's admin panel (dev only) reads state and ledger.
//
//   node libs/ranker/scripts/model/run.mjs [nfl nba nhl mlb] [--dry [--paid]] [--replace] [--all-sources]
//   (--dry: no bets placed, nothing committed touched (state, ledger, history, picks), a snapshot of what the model made of the coming games
//   in .cache/model/dry-<sport>.json, priced from ESPN's free board (--paid: The Odds API's too); --replace: open bets on games not started yet taken back and priced
//   again; --all-sources: every optional source asked, whether its terms are kept or not)

// (the keys: .env on this machine, the repo's secrets on GitHub; first, so every module sees them)
import '../env.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOK, GAME_CAP, LEAGUES, MODEL_EPOCH, PROP_CAPS, TIMING } from './leagues.mjs';
import { MAX_LAST, REPRICE_BY, cadenceOf, inputChanges, inputsOf, lastChanceOf, lineupNow, newsMissing, phaseOf, propAsk, putInactives, reach } from './timing.mjs';
import { fitMargins } from './margins.mjs';
import { ROSTER_MIN, eventOf, gameOf, json, linesOf, roster, scoreboard, teamIds, teamSchedule, ymd } from './espn.mjs';
import { adjust, expect, fit, fitContext, gateOf, replay, round } from './ratings.mjs';
import { OPTIONAL, enrich, featurize, gather } from './context.mjs';
import { RECHECK, finalSummary, postmortems, propPostmortem, recheckSummary, usualRoles } from './postmortem.mjs';
import { closeOf, closingLines, clvOf, clvSummary, propCloseOf } from './clv.mjs';
import { OUTLIER, SPORT_KEYS, call, canSpend, consensusFields, gameLines, hasKey, linesFromEvent, matchNearest, usageSummary } from './oddsapi.mjs';
import { backtestBets, evaluate, repriced, snapshots, trustBets } from './backtest.mjs';
import { buildPicks, kellyOf, levelOf, unlock } from './picks.mjs';
import { boardMarkets, boardProp, buildBoard, seenUpdate } from './board.mjs';
import { boxMarket, boxTotals, playerRows } from './playerlogs.mjs';
import { nflPlayChance, playAt, playChanceSummary } from './playchance.mjs';
import { API_MARKETS, PER_GAME, PROP_WAIT, STATS, apiProps, board, fitProps, marketPts, nflMarket, nflTookSnap, priceProps, readDepth, rowsIndex, settleProp, statInFinal, withApiPrices } from './props.mjs';
import { CACHE, DAY, etDay, isoSecond, readJson, writeJson } from './sources.mjs';
import { BANKROLL, MARKETS, choose, isTracked, trackedRecord, fairPair, placeGame, sameGameOf, sameGameRhoText, fitTrust, gapGuard, guardOf, oneSide, pickText, placement, price, record, settle, voidOf } from './desk.mjs';
import { CHECK_KELLY, CHECK_KINDS, atUnit, causeOf, checkOf, rejudgeChecks, shadowOf, checkResultOf, checkSummary, closeChecks, markPlaced, modelSide, noteOpen, openCheck, resolveChecks, STORED_FRESH, storedBet, upsertCheck, withStoredPrices } from './checks.mjs';
import { ledgerWrites, readChecks, readKept } from './checks-file.mjs';
import { applyNotes, keptNote, noteWords, readDeskNotes, teamNotes } from './notes.mjs';
import { SOON_HOURS, newsFlags, newsWords, readNews } from './news.mjs';
import { checkLearning } from './check-learn.mjs';
import { researchChecks } from './research.mjs';
import { aiBudget, FLOOR_FILE } from './ai-budget.mjs';
import { gameRows, logLines, lostSince, propRows } from './linelog.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
// (the return a side has to show to get the 3-unit top stake; a smaller one scales down to 0.5)
const EV_SCALE = 0.08;
// (the trust a market starts at, before 40 of its bets are graded: halfway between the book and the model)
const START_TRUST = 0.5;
// (what a graded bet whose premise broke in the game counts for in the trust fit and the calibration: set by
// hand, not fit: there aren't graded bets enough yet to fit it on)
const DISRUPTED_WEIGHT = 0.3;
// (the rule for a broken premise (postmortem.mjs): 2, only an exit that isn't for how he played (an injury, an
// ejection) breaks it; 3, the same for every sport's cut minutes, time on ice, plate appearances and snaps, and
// an NHL goalie pulled read off the one who started; the graded bets the old rule weighed down are weighed again
// once when it changes)
// 4, an NHL goalie pulled or an MLB starter out early breaks it only when the story says he was hurt or thrown
// out, or he'd given up a goal or a run at most (more than that, for how he played: noted)
const PM_RULE = 4;
// (what each of the backtest's bets counts for in the trust fit: the replay that prices them again was fit
// on the same seasons, its settings chosen on those games, so the model's edge there is flattered)
const BACKTEST_WEIGHT = 0.5;
const PROPS_ASKED = path.join(CACHE, 'odds-props.json');
// (a game market the guard skipped or the book didn't price: not asked about again for REST_FOR, so the hourly
// runs don't buy The Odds API's lines for it each hour; kept by sport in .cache/model/lines-rest.json)
const LINES_REST = path.join(CACHE, 'lines-rest.json');
const REST_FOR = 3 * 36e5;
// (with The Odds API to hand, a game it didn't price waits for it; this close to the start, it goes on ESPN's
// board after all, tracked, not bet, for the data: LAST_CALL, or 1.5 times the runs' recent gap when that's
// longer (lastCall), MAX_LAST hours at most)
const LAST_CALL = 2 * 36e5;
const lastCall = (r) => Math.max(LAST_CALL, Math.min(MAX_LAST, Number.isFinite(r.gap) ? 1.5 * r.gap : 0) * 36e5);
// (an open bet whose inputs changed is priced again only REPRICE_BY ahead of its start (timing.mjs), and at
// most MAX_REPRICES times: an injury report that keeps flipping doesn't keep it moving)
const MAX_REPRICES = 6;
// (the recent runs' start times, for the gap between them (timing.mjs cadenceOf): .cache/model/runs.json, the
// last 24; a dry run reads it and adds nothing)
const RUNS = path.join(CACHE, 'runs.json');
// (the desk's Claude spend, every sport's, against the caps: ai-budget.mjs; the workflow's cache keeps it)
const AI_USAGE = path.join(CACHE, 'ai-usage.json');
// (the open bets taken back on news but not yet placed again, kept across runs (a bet held a run, its price
// not in yet or its market resting, keeps its count toward MAX_REPRICES and what it was when it's placed
// later): .cache/model/taken-back-<sport>.json, each dropped once its game starts or it's placed again)
const TAKEN_BACK = (sport) => path.join(CACHE, `taken-back-${sport}.json`);
// (the inputs each coming game was last seen with, kept so a re-price can say who joined or left a list:
// .cache/model/inputs-<sport>.json, a convenience; the bets keep their own inputs' hashes)
const INPUTS = (sport) => path.join(CACHE, `inputs-${sport}.json`);
// (a live bet placed this long past its window's opening (from before the desk waited for the news) counts
// this much in the trust fit)
const EARLY_SLACK = 6 * 36e5;
const EARLY_WEIGHT = 0.5;
// (The Odds API's props for a game: asked at most this many times (once to bet, once near the start for the
// close, and again when its props are priced again on news))
// (6: a slate priced again on a change to the model (--replace) still keeps its near-start ask)
const PROP_ASKS = 6;

const read = readJson;
const write = writeJson;

// The ledger written, its CHECKs apart in their own file (checks-file.mjs ledgerWrites: checks.json; an
// unreadable one never written over, the ledger's own list kept on it till it's mended)
function writeLedger(r, ledger) {
  const out = ledgerWrites(r, ledger);
  writeIfChanged(r.files.ledger, out.ledger);
  if (out.checks) writeIfChanged(r.files.checks, out.checks);
}

// A file the workflow commits, written only when its content changed (ignoring what changes every run: when
// it ran, the props' last-run counts); lines: an array written an item a line (small diffs)
function writeIfChanged(file, data, { lines = false } = {}) {
  // (--dry: nothing committed is touched, so a check on the code leaves the tree as the bots left it)
  if (DRY) return false;
  const text = lines ? `[\n${data.map((x) => JSON.stringify(x)).join(',\n')}\n]\n` : JSON.stringify(data);
  const strip = (x) => (x && !Array.isArray(x) ? { ...x, updated: null, at: null, props: x.props ? { ...x.props, lastRun: null } : x.props } : x);
  const before = readJson(file, null);
  if (before && JSON.stringify(strip(before)) === JSON.stringify(strip(data))) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return true;
}

// One sport's run, step by step (each step a function of the run so far: r)
async function runSport(sport) {
  const r = { sport, cfg: LEAGUES[sport], now: new Date(), newBets: 0, graded: 0, gap: GAP };
  r.at = r.now.toISOString();
  r.files = {
    games: path.join(ROOT, 'apps', sport, 'scripts/model/games.json'),
    state: path.join(ROOT, 'apps', sport, 'src/StaticData/model/state.json'),
    ledger: path.join(ROOT, 'apps', sport, 'src/StaticData/model/ledger.json'),
    context: path.join(CACHE, `context-${sport}.json`),
    backtest: path.join(ROOT, 'apps', sport, 'scripts/model/backtest.json'),
    picks: path.join(ROOT, 'apps', sport, 'src/StaticData/model/picks.json'),
    checks: path.join(ROOT, 'apps', sport, 'src/StaticData/model/checks.json'),
    teams: path.join(ROOT, 'apps', sport, 'src/StaticData/model/teams.json'),
    // (the picks' write-ups, kept per bet till its facts change: committed, not deployed)
    writeups: path.join(ROOT, 'apps', sport, 'scripts/model/writeups.json'),
    // (the betting board, every market priced (board.mjs), and every price it's shown, for the settler)
    board: path.join(ROOT, 'apps', sport, 'src/StaticData/model/board.json'),
    boardSeen: path.join(ROOT, 'apps', sport, 'scripts/model/board-seen.json'),
  };
  // (--picks-only: the picks written from the ledger as it stands, nothing fetched, fit or bet)
  if (PICKS_ONLY) return writePicks(r, true);
  await writeTeams(r);
  // (the owner's notes on the picks, read once for every sport: none without the secret, quietly)
  r.notes = await (NOTES ??= readDeskNotes());
  await loadHistory(r);
  fitRatings(r);
  await fitTheContext(r);
  await fitTheProps(r);
  inactivesNow(r);
  await runBacktest(r);
  logContext(r);
  r.ledger = readKept(r.files.ledger, { sport, bankroll: BANKROLL, bets: [] });
  r.ledger.bankroll = BANKROLL;
  r.ledger.checks = readChecks(r, r.ledger);
  // (the stored CHECKs judged by the rule: one from before it, or one no run prices again, passed (checks.mjs
  // rejudgeChecks))
  const rejudged = rejudgeChecks(r.ledger.checks, r.now);
  if (rejudged.length) console.log(`${sport}: ${rejudged.length} stored CHECKs passed by the CHECK rule (now shadows: their price frozen): ${rejudged.map((c) => `${c.pick} (${c.passAs})`).join(', ')}`);
  // (the open bets published before they were locked (the old rule: published the run they were first shown)
  // made shown ones again, so the news and --replace price them again: picks.mjs unlock)
  const unlocked = unlock(r.ledger, r.now);
  if (unlocked) console.log(`${sport}: ${unlocked} open bets published before they were locked made shown picks again (priced again on news, or by --replace, till ${REPRICE_BY / 60e3} minutes before the start)`);
  console.log(`${sport}: the runs' recent gap ${GAP === null ? 'unknown (too few runs kept)' : `${round(GAP, 1)}h`}: the last chance ${round(lastChanceOf(sport, GAP), 1)}h before the start, the last call ${round(lastCall(r) / 36e5, 1)}h`);
  await captureClose(r);
  refitTrust(r);
  await gradeBets(r);
  replaceOpen(r);
  repriceOpen(r);
  // (the coming games' lines once the run knows which markets are due: The Odds API asked only for those)
  await liveLines(r);
  betGames(r);
  await betProps(r);
  logTheLines(r);
  placeBets(r);
  recordChecks(r);
  writePicks(r);
  writeBoard(r);
  saveState(r);
}

// The line log (linelog.mjs): every line this run saw, the ones new against the last logged appended to the
// cache's month file; --dry counts them and writes nothing. The month it started kept in the state (lineLog.since):
// that month's file gone from the cache (lostSince) is warned of, noted (lineLog.lost) and the months started over
function logTheLines(r) {
  const starts = new Map([...(r.games?.values?.() ?? [])].map((g) => [String(g.id), Date.parse(g.date)]));
  const log = r.state?.lineLog ?? null;
  const lost = lostSince(r.sport, log?.since);
  if (lost) console.warn(`::warning::${r.sport}: the line log's history since ${log.since} isn't in the cache (missed or evicted): logged again from this run, the months before lost`);
  const n = logLines(r.sport, r.lineRows ?? [], { now: r.now.getTime(), starts, dry: DRY });
  if (!DRY && r.state && n !== null && (lost || (!log?.since && n > 0))) {
    const month = r.now.toISOString().slice(0, 7);
    // (a run that logged nothing after the loss leaves since unset: the next to log sets it, no warning again)
    r.state.lineLog = { ...(n > 0 ? { since: month } : {}), ...(lost ? { lost: [...(log.lost ?? []), { at: r.now.toISOString(), since: log.since }].slice(-10) } : log?.lost ? { lost: log.lost } : {}) };
  }
  if (n !== null) console.log(`${r.sport}: the line log ${n} new of ${(r.lineRows ?? []).length} seen${DRY ? ' (dry: not written)' : ''}`);
}

// The league's teams' colors for the desk (ESPN's team list, which a browser can't ask: it sends no CORS
// header): abbreviation -> { id, color, alt }, written when they change (once a season, about). A failed ask
// leaves the file as it was
async function writeTeams(r) {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${r.cfg.league}/teams`);
    if (!res.ok) return;
    const body = await res.json();
    const teams = Object.fromEntries(
      (body?.sports?.[0]?.leagues?.[0]?.teams ?? [])
        .map(({ team }) => [team.abbreviation, { id: String(team.id), color: team.color ?? null, alt: team.alternateColor ?? null }])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    if (Object.keys(teams).length) writeIfChanged(r.files.teams, { teams });
  } catch (err) {
    console.warn(`${r.sport}: teams' colors skipped (${err.message})`);
  }
}

// 7. the public picks (picks.mjs): the best bets on games not started, written for the site's Bets page when
// they change; the ones shown marked shown on the ledger, and published once locked (REPRICE_BY before the
// start), so their record is theirs alone and of the bets as they stood at the start. Each with its write-up
// (writeup.mjs), kept per bet in writeups.json till its facts change, written from the state as it stands
// (this run's trust, context terms and props' fits): an unreadable writeups.json is written fresh, never stops
// the picks
function writePicks(r, alone = false) {
  const ledger = alone ? readKept(r.files.ledger, { bets: [] }) : r.ledger;
  if (alone) {
    ledger.checks = readChecks(r, ledger);
    rejudgeChecks(ledger.checks, r.now);
  }
  const saved = alone ? readKept(r.files.state, {}) : r.state;
  const trust = alone ? (saved.trust ?? {}) : r.trust;
  const games = alone ? new Map(readKept(r.files.games, []).map((g) => [g.id, g])) : r.games;
  const state = { trust, context: (alone ? null : r.context) ?? saved?.context ?? null, props: r.props && !alone ? { types: Object.entries(r.props).map(([key, f]) => ({ key, params: f.params, check: f.check, allPlayersBias: f.checkAll?.bias ?? null })) } : (saved?.props ?? null) };
  const writeups = readJson(r.files.writeups, null) ?? { sport: r.sport, items: {} };
  writeups.items ??= {};
  const out = buildPicks(r.sport, ledger, trust, games, r.now, { state, writeups, keepChecks: !!r.checksUnreadable });
  // (checks.json unreadable: picks.json's CHECKs the last good list, its games not started)
  if (r.checksUnreadable) out.checks = (readJson(r.files.picks, null)?.checks ?? []).filter((c) => Date.parse(c?.start) > r.now.getTime());
  if (DRY) {
    console.log(`${r.sport} (dry): ${out.checks.length} CHECKs (their own list), ${out.picks.length} picks: ${out.picks.map((p) => `${p.level} ${p.pick} (${p.score})`).join(' | ')}`);
    return;
  }
  const changed = writeIfChanged(r.files.picks, out);
  writeIfChanged(r.files.writeups, writeups);
  if (alone) writeLedger(r, ledger);
  console.log(`${r.sport}: ${out.picks.length} picks${changed ? ' written' : ' unchanged'}`);
}

// 7b. the betting board (board.mjs): every market this run priced on the games not started, each side's Kelly
// score and band, the bot's open sides marked, over the last board where a game or its props weren't priced
// again; and every price it's shown kept (board-seen.json) for the play-money settler's price check. --dry:
// only with --board-out=<dir>, written there (a scratch check of its shape and size), never the committed ones
function writeBoard(r) {
  const out = BOARD_OUT ? path.resolve(BOARD_OUT) : null;
  if (DRY && !out) return;
  const board = buildBoard(r.sport, { prev: readJson(r.files.board, null), games: r.boardGames ?? new Map(), props: r.boardProps ?? new Map(), bets: r.ledger.bets, checks: r.ledger.checks ?? [], now: r.now });
  const seen = seenUpdate(readJson(r.files.boardSeen, null), board, r.now);
  const props = board.games.reduce((t, g) => t + g.p.length, 0);
  if (DRY) {
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, `board-${r.sport}.json`), JSON.stringify(board));
    writeFileSync(path.join(out, `board-seen-${r.sport}.json`), JSON.stringify(seen));
    console.log(`${r.sport} (dry): board of ${board.games.length} games, ${props} props, ${JSON.stringify(board).length} bytes, in ${out}`);
    return;
  }
  const changed = writeIfChanged(r.files.board, board);
  writeIfChanged(r.files.boardSeen, seen);
  console.log(`${r.sport}: board of ${board.games.length} games, ${props} props${changed ? ' written' : ' unchanged'}`);
}

// 1. the history: games.json brought up to date from the last few days' scoreboards (and the next two: the
// coming games, with their lines), two seasons of the teams' schedules the first time
async function loadHistory(r) {
  const { sport, cfg, now } = r;
  const games = new Map(readKept(r.files.games, []).map((g) => [g.id, g]));
  if (!games.size) {
    const current = (await json(`https://site.api.espn.com/apis/site/v2/sports/${cfg.league}/scoreboard`))?.leagues?.[0]?.season?.year;
    const ids = await teamIds(cfg.league);
    for (const season of [current - 1, current]) {
      for (const id of ids) {
        for (const type of [2, 3]) {
          for (const e of await teamSchedule(cfg.league, id, season, type)) {
            const g = gameOf(e, { innings: sport === 'mlb' });
            if (g && !games.has(g.id)) games.set(g.id, { ...g, season: g.season ?? season, type: g.type ?? type });
          }
        }
      }
    }
    console.log(`${sport}: history started, ${games.size} games (${current - 1}-${current})`);
  }
  const upcoming = [];
  // (the last few days and the next two; and the day of any bet still open from before then, should the
  // runs ever have stopped a while)
  const days = new Set(Array.from({ length: 7 }, (_, i) => ymd(new Date(now.getTime() + (i - 4) * DAY))));
  // (the CHECKs not yet graded too: checks.mjs)
  const kept = readKept(r.files.ledger, { bets: [] });
  const open = [...kept.bets.filter((b) => b.status === 'open'), ...readChecks(r, kept).filter((c) => !c.checkResult)];
  for (const bet of open) {
    if (Date.parse(bet.start) < now.getTime() - 4 * DAY) days.add(ymd(new Date(bet.start)));
  }
  const seen = new Set();
  // (a game's word on it as it is now: one called off and since played loses its off)
  const keep = (g) => {
    const { off: _off, ...was } = games.get(g.id) ?? {};
    games.set(g.id, { ...was, ...g });
    seen.add(g.id);
  };
  for (const day of days) {
    for (const e of await scoreboard(cfg.league, day)) {
      const g = gameOf(e, { innings: sport === 'mlb' });
      if (!g || (g.type !== 2 && g.type !== 3)) continue;
      keep(g);
      const lines = linesOf(e);
      // (not one called off: postponed, suspended or canceled, its lines are stale and its bets would be void)
      if (!g.final && !g.off && lines && Date.parse(g.date) > now.getTime() + 5 * 60e3) {
        upcoming.push({ game: g, lines, event: e });
        // (the line log: ESPN's board's lines for every coming game, every run (linelog.mjs))
        (r.lineRows ??= []).push(...gameRows(g.id, lines, 'e'));
      }
    }
  }
  // (a game bet on, past its start, that none of those days showed: moved off its day, postponed; asked by its
  // id, so its bets are graded or void (desk.mjs voidOf) and never left open)
  for (const id of new Set(open.filter((b) => Date.parse(b.start) < now.getTime() && !seen.has(b.event)).map((b) => b.event))) {
    try {
      const e = await eventOf(cfg.league, id);
      const g = e && gameOf(e, { innings: sport === 'mlb' });
      if (g) keep({ ...g, season: g.season ?? games.get(id)?.season ?? null, type: g.type ?? games.get(id)?.type ?? null });
    } catch (err) {
      console.warn(`${sport}: game ${id} not read (${err.message})`);
    }
  }
  await enrich(sport, cfg, games).catch((err) => console.warn(`${sport}: history's gaps left (${err.message})`));
  r.games = games;
  r.upcoming = upcoming;
  r.history = [...games.values()].filter((g) => g.type === 2 || g.type === 3);
  writeIfChanged(r.files.games, r.history.sort((a, b) => a.date.localeCompare(b.date)), { lines: true });
}

// 1b. the coming games' lines from The Odds API (oddsapi.mjs): the desk's book's prices, Pinnacle's fair
// chance, and the other books' consensus beside them, the data's (WIDE_BOOKS: 10 books, one region's cost); one
// call for the sport (its three markets: 3 credits), only with a market still to bet (a game already
// bet only notes the line it sees, which ESPN's board, the same book's, gives free: asked hourly, these used
// up the day's allowance overnight; a market the guard skipped or the book didn't price rests REST_FOR before
// it's asked about again, so it doesn't buy the call every hour) and today's lines allowance left. Otherwise
// ESPN's board, and The Odds API's free event list for the ids its props are asked by. Run once the bets to be
// priced again are taken back (repriceOpen), so a market is still to bet only when it's due: its game inside
// its window (leagues.mjs TIMING) with its news in, or inside the last chance (linesDue); a game days out, or
// one waiting on its goalies or starters, buys nothing. The range reaches as far as the widest window (and its
// late games); with a key, a game The Odds API didn't price this run isn't bet off ESPN's board (betGames)
async function liveLines(r) {
  r.linesSource = 'espn';
  r.rest ??= DRY ? {} : (read(LINES_REST, {})[r.sport] ?? {});
  if (!r.upcoming.length || !hasKey()) return;
  const range = { commenceTimeFrom: isoSecond(r.now), commenceTimeTo: isoSecond(r.now.getTime() + (reach(r.sport) + 6) * 36e5) };
  const placed = r.placed;
  const unbet = r.upcoming.some((u) => linesDue(r, u.game) && (DRY || MARKETS.some((m) => !placed.has(`${u.game.id}:${m}`) && !resting(r, `${u.game.id}:${m}`))));
  if (!unbet || !canSpend('lines', 3)) {
    const list = await call('events', `/sports/${SPORT_KEYS[r.sport]}/events`, range);
    if (Array.isArray(list)) for (const [u, ev] of matchGames(list, r.upcoming)) u.lines.oddsEvent = ev.id;
    return;
  }
  // (the wide call refused or failed: asked again of the book and Pinnacle alone, oddsapi.mjs gameLines)
  const events = await gameLines(r.sport, range);
  if (!Array.isArray(events)) return;
  let matched = 0;
  const pairs = matchGames(events, r.upcoming);
  // (a coming game The Odds API doesn't list: its markets rest, rather than buying the call again each hour)
  for (const u of r.upcoming) if (!pairs.has(u) && linesDue(r, u.game)) for (const m of MARKETS) if (!placed.has(`${u.game.id}:${m}`)) rest(r, `${u.game.id}:${m}`, 'not on The Odds API');
  for (const [u, ev] of pairs) {
    const l = linesFromEvent(ev);
    u.lines.oddsEvent = ev.id;
    // (listed, but not by the book yet: its markets rest too, rather than buying the call again each hour; the
    // game stays off ESPN's board, betGames holding it till LAST_CALL)
    if (!l) {
      if (linesDue(r, u.game)) for (const m of MARKETS) if (!placed.has(`${u.game.id}:${m}`)) rest(r, `${u.game.id}:${m}`, 'not priced by the book on The Odds API');
      continue;
    }
    const odds = { spread: l.spreads, total: l.totals, ml: l.h2h };
    u.lines = {
      book: 'DraftKings',
      source: 'the odds api',
      oddsEvent: ev.id,
      move: u.lines.move,
      ml: { home: l.h2h?.prices.home ?? null, away: l.h2h?.prices.away ?? null },
      spread: { home: { line: l.spreads?.line ?? null, odds: l.spreads?.prices.home ?? null }, away: { line: l.spreads ? -l.spreads.line : null, odds: l.spreads?.prices.away ?? null } },
      total: { line: l.totals?.line ?? null, over: l.totals?.prices.over ?? null, under: l.totals?.prices.under ?? null },
      fair: Object.fromEntries(Object.entries(odds).filter(([, v]) => v).map(([k, v]) => [k, v.fair])),
      fairSource: Object.fromEntries(Object.entries(odds).filter(([, v]) => v).map(([k, v]) => [k, v.sharp !== null ? 'pinnacle' : BOOK])),
      // (the other books' consensus at the book's line, by market (oddsapi.mjs consensusOf): the data's, not priced off)
      consensus: Object.fromEntries(Object.entries(odds).filter(([, v]) => v?.consensus).map(([k, v]) => [k, v.consensus])),
    };
    consensusSeen(r, 'lines', Object.values(u.lines.consensus), Object.keys(odds).filter((k) => odds[k]).length);
    (r.lineRows ??= []).push(...gameRows(u.game.id, u.lines, 'o'));
    matched++;
  }
  r.linesSource = `the odds api (${matched} of ${r.upcoming.length} games)`;
  console.log(`${r.sport}: lines from The Odds API for ${matched} of ${r.upcoming.length} coming games`);
  consensusLog(r, 'lines');
}

// (the other books' consensus this run (oddsapi.mjs consensusOf), counted and logged: of the markets the book
// priced, how many had one and how many the book priced OUTLIER better than it on a side; the data's only)
function consensusSeen(r, kind, list, of) {
  const c = ((r.consensusSeen ??= {})[kind] ??= { markets: 0, with: 0, outliers: 0 });
  c.markets += of;
  c.with += list.length;
  c.outliers += list.filter((x) => x.outlier).length;
}
// (a game market's row's consensus fields, its side's: oddsapi.mjs consensusFields; none off ESPN's board)
const consensusOn = (lines, key, side) => consensusFields(lines?.consensus?.[key], side, key === 'total' ? 'over' : 'home');
function consensusLog(r, kind) {
  const c = r.consensusSeen?.[kind];
  if (c?.markets) console.log(`${r.sport}: the other books' consensus on ${c.with} of ${c.markets} ${kind === 'lines' ? 'game markets' : 'props'} at DraftKings' line, DraftKings ${Math.round(OUTLIER * 100)}%+ better on a side on ${c.outliers} (logged, not priced off)`);
}

// (The Odds API's events matched to the coming ESPN games: the same two teams, by nickname, within six hours,
// one to one, nearest start first: a doubleheader's second game never takes the first's lines)
function matchGames(events, upcoming) {
  const candidates = [];
  for (const u of upcoming) {
    const sides = u.event?.competitions?.[0]?.competitors ?? [];
    const nick = (where) => sides.find((c) => c.homeAway === where)?.team?.name ?? null;
    const is = (full, n) => !!n && (full === n || full.endsWith(` ${n}`));
    for (const ev of events) {
      const apart = Math.abs(Date.parse(ev.commence_time) - Date.parse(u.game.date));
      if (is(ev.home_team, nick('home')) && is(ev.away_team, nick('away')) && apart < 6 * 36e5) candidates.push([u, ev, apart]);
    }
  }
  return matchNearest(candidates);
}

// (a market resting: skipped by the guard or not priced by the book a run ago, not asked about again until
// its time is up)
// (one rested before an owner's note on its game was written isn't: the note's news may change it)
const resting = (r, id) => {
  const until = Date.parse(r.rest?.[id]?.until ?? '');
  if (!(until > r.now.getTime())) return false;
  return !((r.noteAt?.get(id.split(':')[0]) ?? 0) > until - REST_FOR);
};
function rest(r, id, why) {
  r.rest[id] = { until: new Date(r.now.getTime() + REST_FOR).toISOString(), why };
}
// (a game's markets due this run: inside its window with the news they wait for in, or inside the last chance
// with what's known: leagues.mjs TIMING, timing.mjs)
// (by the run's clock, r.now, as betGames and betProps judge it: the lines bought for a game are the ones it bets)
function linesDue(r, game) {
  const phase = phaseOf(r.sport, 'lines', Date.parse(game.date) - r.now.getTime(), r.gap);
  if (phase === 'early') return false;
  return phase === 'last' || !newsMissing(r.sport, r.live?.get(game.id), { kind: 'lines' }).length;
}

// (the rests kept, each sport's, the ones run out dropped; never on a dry run)
function saveRest(r) {
  if (DRY) return;
  const all = read(LINES_REST, {});
  all[r.sport] = Object.fromEntries(Object.entries(r.rest ?? {}).filter(([, v]) => Date.parse(v.until) > r.now.getTime()));
  write(LINES_REST, all);
}

// 2. the ratings, refit (each setting that moves logged with why)
function fitRatings(r) {
  const { cfg, at } = r;
  const state = readKept(r.files.state, { sport: r.sport, changelog: [] });
  const before = state.params ?? cfg.priors;
  const best = fit(r.history, { ...cfg.priors, sigma: before.sigma ?? cfg.priors.sigma, sigmaT: before.sigmaT ?? cfg.priors.sigmaT }, cfg.grid);
  const params = best?.params ?? before;
  const why = best ? `on ${best.test.n} games it hadn't seen: margins off by ${round(best.test.maeMargin)}, totals by ${round(best.test.maeTotal)}, winners ${round(best.test.winHit * 100, 1)}% right` : 'not enough history';
  for (const key of ['k', 'hfa', 'revert', 'kO']) {
    if (state.params && state.params[key] !== params[key]) state.changelog.push({ at, what: `ratings ${key}`, from: state.params[key], to: params[key], why });
  }
  Object.assign(r, { state, best, params });
}

// 2b. the context: its facts brought up to date, each game's terms, their sizes fit (nothing here may stop
// the run: without it, every term is 0 and the ratings bet alone); then the ratings replayed with it, each
// final's expected score kept (the props' game script)
async function fitTheContext(r) {
  const { sport, cfg, history, params } = r;
  r.facts = read(r.files.context, {});
  r.ctxFit = null;
  r.feats = null;
  r.live = new Map();
  try {
    const t0 = Date.now();
    r.live = await gather(sport, cfg, history, r.upcoming, r.facts, wantSource(r), (r.times = {}));
    // (the owner's notes with concrete news, into their games' injury reports before the context reads them)
    await noteInjuries(r);
    // (the teams' news, and the owner's notes on a team: their flags on the coming games)
    await teamNews(r);
    const { nfl: _rows, ...kept } = r.facts;
    write(r.files.context, kept);
    r.feats = featurize(sport, cfg, history, r.facts, r.live);
    r.ctxFit = fitContext(history, params, r.feats.feats, r.feats.terms);
    console.log(`${sport}: context gathered and fit in ${Math.round((Date.now() - t0) / 1000)}s (${Object.entries(r.times)
      .map(([k, v]) => `${k} ${(v.ms / 1000).toFixed(1)}s${v.ok ? '' : ' failed'}`)
      .join(', ')}${Object.entries(r.asked).filter(([, v]) => v === 'skipped').length ? `; skipped ${Object.entries(r.asked).filter(([, v]) => v === 'skipped').map(([k]) => k).join(', ')}` : ''})`);
  } catch (err) {
    console.warn(`${sport}: context left out (${err.stack ?? err})`);
  }
  // (with the context, the spreads around its expectations are the ones it priced with)
  if (r.ctxFit) Object.assign(params, { sigma: round(r.ctxFit.after.sigma, 3), sigmaT: round(r.ctxFit.after.sigmaT, 3) });
  r.expPts = new Map();
  r.expAll = new Map();
  r.teams = replay(history, params, 0, r.ctxFit?.ctx ?? null, (g, e) => {
    r.expPts.set(g.id, [e.homePts, e.awayPts]);
    r.expAll.set(g.id, e);
  }).state;
  r.weights = r.teams.weights ?? null;
  fitTheMargins(r);
}

// 2b. the owner's notes (notes.mjs: Firestore's deskNotes, read at the run's start) with a player and his
// status put into their coming games' injury reports, flagged as an owner's note: the context, the props and
// the inputs (an open bet on the game priced again: repriceOpen) all see it, so a CHECK can come back as a
// real bet. A noted game's markets resting since before the note are asked about again (resting), and its
// props are owed an ask of The Odds API the first run a note is seen (betProps). Any failure: no notes.
// The CHECKs' news research (research.mjs: CHECK_RESEARCH=1 alone, never --dry) first: the day's biggest
// CHECKs looked into (r.researchFound, kept on them by recordChecks) as a label only. A finding is never put
// into the injury report: an LLM reading the web, with no person in the loop, mustn't move the prices or turn a
// CHECK into a staked bet; the owner's note on the CHECK puts it in where it's right
async function noteInjuries(r) {
  r.notesApplied = new Set();
  r.researchApplied = new Set();
  r.researchFound = new Map();
  r.noteAt = new Map();
  r.propNoteAt = new Map();
  let checks = [];
  try {
    checks = readChecks(r, readKept(r.files.ledger, {}));
    // (judged by the CHECK rule as the run's start does: a CHECK it passes neither researched nor a note's)
    rejudgeChecks(checks, r.now);
  } catch (err) {
    console.warn(`${r.sport}: CHECKs not read for the notes (${err.message})`);
  }
  // (and for the notes on a team: teamNews)
  r.noteChecks = checks;
  try {
    if (!r.checksUnreadable) {
      const budget = process.env.CHECK_RESEARCH === '1' ? aiBudget({ file: AI_USAGE, floor: FLOOR_FILE, now: r.now, dry: DRY }) : null;
      r.researchFound = await researchChecks({ sport: r.sport, checks, now: r.now, dry: DRY, budget, reportOf: (c) => r.live?.get(String(c.event))?.injuries ?? null });
    }
  } catch (err) {
    console.warn(`${r.sport}: CHECK research skipped (${err.message})`);
  }
  const notes = new Map(r.notes ?? []);
  if (!notes.size) return;
  try {
    // (a shadow's never: checks.mjs shadowOf, a PASS no one sees, owes no ask)
    const propChecks = new Set(checks.filter((c) => c.market === 'prop' && !c.checkResult && !c.hidden).map((c) => c.id));
    const applied = await applyNotes(r.sport, r.live, r.upcoming, notes, { checks, rosterOf: (team) => roster(r.cfg.league, team, 1) });
    for (const x of applied) {
      (x.from === 'research' ? r.researchApplied : r.notesApplied).add(x.id);
      const at = Date.parse(notes.get(x.id)?.at ?? '') || 0;
      r.noteAt.set(x.event, Math.max(r.noteAt.get(x.event) ?? 0, at));
      // (a prop CHECK's note alone owes its game's props an ask: betProps)
      if (propChecks.has(x.id)) r.propNoteAt.set(x.event, Math.max(r.propNoteAt.get(x.event) ?? 0, at));
    }
    if (applied.length) console.log(`${r.sport}: notes put into the injury reports: ${applied.map((x) => `${x.name} ${x.status}${x.from === 'research' ? ' (research)' : " (owner's note)"}`).join(', ')}`);
  } catch (err) {
    console.warn(`${r.sport}: owner's notes not applied (${err.message})`);
  }
}

// 2b. the teams' news (news.mjs: ESPN's per-team feed, read once a UTC day a team, a team with a game within
// SOON_HOURS every REREAD_HOURS, cached): a story on a change of play-caller, coordinator or head coach (or a
// benching) flags its team's unit for its next games, each coming game's flags on its live facts (l.news):
// its props of that unit held as CHECKs either side (props.mjs, cause 'news'), its game lines at the minimum
// stake (bet), its inputs priced again when a story lands (timing.mjs inputsOf). Then the owner's notes on a
// team (notes.mjs teamNotes: no player, reason news) the same way. Any failure: no flags, the desk as it was
async function teamNews(r) {
  try {
    const t = (r.now ?? new Date()).getTime();
    const soon = new Set((r.upcoming ?? []).filter(({ game }) => Date.parse(game.date) - t <= SOON_HOURS * 3600e3).flatMap(({ game }) => [String(game.home), String(game.away)]));
    const news = await readNews(r.sport, r.cfg, { now: r.now, soon });
    if (news) for (const l of r.live.values()) l.newsRead = true;
    newsFlags(news, r.live, r.history, r.upcoming);
  } catch (err) {
    console.warn(`${r.sport}: teams' news not applied (${err.message})`);
  }
  try {
    const notes = new Map(r.notes ?? []);
    for (const x of teamNotes(r.sport, r.live, r.upcoming, notes, { checks: r.noteChecks ?? [] })) {
      r.notesApplied?.add(x.id);
      const at = Date.parse(notes.get(x.id)?.at ?? '') || 0;
      r.noteAt?.set(x.event, Math.max(r.noteAt.get(x.event) ?? 0, at));
    }
  } catch (err) {
    console.warn(`${r.sport}: owner's notes on a team not applied (${err.message})`);
  }
  const abbr = new Map((r.upcoming ?? []).flatMap(({ game }) => [[String(game.home), game.homeAbbr], [String(game.away), game.awayAbbr]]));
  const flagged = (r.upcoming ?? []).flatMap(({ game }) => (r.live.get(game.id)?.news ?? []).map((x) => `${abbr.get(x.team) ?? x.team} ${x.unit} (${game.awayAbbr} @ ${game.homeAbbr} ${String(game.date).slice(0, 10)}: ${x.from === 'owner note' ? "an owner's note" : x.headline})`));
  if (flagged.length) console.log(`${r.sport}: news flags on the coming games: ${flagged.join('; ')}`);
}

// 2b'. the margins' shape (margins.mjs fitMargins): how often each margin comes against the normal's say, fit
// on the finals' expectations from the replay just run (each made before its game), kept only if it predicts
// the held-out finals better; logged when it joins or leaves. Without it (a throw, too few games), the plain
// normal cut into whole numbers, ties or none by the sport
function fitTheMargins(r) {
  const { sport, state, at } = r;
  try {
    r.margins = fitMargins(sport, r.history, r.expAll, r.params.sigma);
  } catch (err) {
    console.warn(`${sport}: margins' shape left out (${err.message})`);
    r.margins = fitMargins(sport, [], new Map(), r.params.sigma);
  }
  r.shape = { ties: r.margins.ties, ot: r.margins.ot, w: r.margins.kept ? r.margins.w : null };
  const w = r.margins.w ?? {};
  const top = Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k} x${v}`);
  console.log(`${sport}: margins' shape ${r.margins.kept ? 'kept' : 'left out'} on ${r.margins.n} finals (held-out log likelihood ${r.margins.gain === null ? 'not tested' : `${r.margins.gain > 0 ? '+' : ''}${r.margins.gain} a game`})${r.margins.kept ? `; most over the normal: ${top.join(', ')}` : ''}`);
  const was = state.margins?.kept ?? null;
  if (was !== null && was !== r.margins.kept) state.changelog.push({ at, what: `margins' shape${r.margins.kept ? '' : ' (left out)'}`, from: was, to: r.margins.kept, why: `held-out log likelihood ${r.margins.gain} a game on ${r.margins.n} finals` });
}

// Whether to ask an optional source this run (context.mjs OPTIONAL): while any term it feeds has earned its
// place or hasn't been tried; otherwise once a week, or once the history has 30% more games, since it was last
// asked. Each ask is noted (state.retest)
function wantSource(r) {
  const terms = r.state.context?.terms ?? [];
  const kept = new Set(terms.filter((t) => t.kept).map((t) => t.key));
  const known = new Set(terms.map((t) => t.key));
  const finals = r.history.filter((g) => g.final).length;
  r.state.retest ??= {};
  r.asked = {};
  return (source) => {
    const feeds = OPTIONAL[r.sport]?.[source] ?? [];
    const last = r.state.retest[source];
    const needed = ALL_SOURCES || !terms.length || feeds.some((k) => kept.has(k) || !known.has(k));
    const due = !last || r.now.getTime() - Date.parse(last.at) >= 7 * DAY || finals >= 1.3 * last.games;
    const ask = needed || due;
    r.asked[source] = ask ? (needed ? 'needed' : 're-test') : 'skipped';
    if (ask && !needed && !DRY) r.state.retest[source] = { at: r.at, games: finals };
    if (ask && needed) r.state.retest[source] = { at: r.at, games: finals };
    return ask;
  };
}

// A coming game's expectation: the ratings', with its context terms at their fitted sizes
function expectFor(r, game) {
  const base = expect(r.teams, game, r.params);
  const f = r.feats?.feats.get(game.id);
  const adjM = f && r.weights ? f.m.reduce((s, v, i) => s + v * r.weights.m[i], 0) : 0;
  const adjT = f && r.weights ? f.t.reduce((s, v, i) => s + v * r.weights.t[i], 0) : 0;
  return { exp: adjust(base, adjM, adjT), f, adjM, adjT };
}

// 2c. the props: every player's game lines, and each prop type's projection fit and checked on them
async function fitTheProps(r) {
  const { sport, cfg, history } = r;
  r.props = null;
  r.rows = [];
  try {
    const t0 = Date.now();
    r.rows = await playerRows(sport, cfg, history, r.facts);
    const info = new Map([...(r.feats?.feats ?? new Map())].map(([id, f]) => [id, f.info]));
    // (the history's betting lines: the NFL's nflverse closes, the NBA's its finals' summaries' (playerlogs.mjs
    // boxMarket: read by the blowout by role, a measure on demand); none elsewhere. The NHL's totals alone, its
    // finals' summaries' too (boxTotals: the skaters' market total, props.mjs CTX mTotal))
    const market = sport === 'nfl' ? await nflMarket(history) : sport === 'nba' ? boxMarket('nba') : null;
    r.props = fitProps(sport, r.rows, r.expPts, info, r.facts, market, sport === 'nhl' ? boxTotals('nhl') : null);
    console.log(`${sport}: props' projections fit on ${r.rows.length} player games in ${Math.round((Date.now() - t0) / 1000)}s`);
    // (the NFL: a questionable player's chance of playing, from the seasons before this one's injury reports
    // (playchance.mjs); none, or another sport: every questionable one at half, as before. This season the
    // history's latest or the calendar's (an NFL season's from March on: before its first game is in the
    // history, last season's reports are in the table all the same))
    const nflNow = r.now.getUTCMonth() >= 2 ? r.now.getUTCFullYear() : r.now.getUTCFullYear() - 1;
    r.playChance = sport === 'nfl' ? await nflPlayChance(cfg.deepen ?? 2016, Math.max(nflNow, ...history.map((g) => g.season))) : null;
    if (r.playChance) {
      const c = r.playChance.check;
      console.log(`${sport}: play chance: ${r.playChance.n} questionable regulars' reports, ${Math.round(r.playChance.rate * 100)}% played; levels ${r.playChance.levels.join(', ') || 'none'} (held out ${c.held.join(', ')}, as read live: ${c.n} reports, log loss ${c.loss} against the flat half's ${c.flat}; ${Object.entries(c.sides).map(([g, x]) => `${g} ${x.n} ${x.loss}${x.half ? ', at half' : ''}`).join(', ')}; ${c.tried.map((x) => `${x.level} ${x.gain >= 0 ? '+' : ''}${x.gain}${x.unread ? ', measured, not read live' : x.kept ? '' : `, left out${x.worse ? `: ${x.worse.join(', ')}` : ''}`}`).join('; ')})`);
    }
    // (the learned split's table (matchups.mjs absorbTable, project.mjs vl): its games learned from, and each
    // missing class's work the classes playing took, summed (under 1: the work lost))
    const ab = Object.values(r.props ?? {})[0]?.matchups?.absorbed?.() ?? null;
    if (ab) {
      const sums = Object.entries(ab).filter(([, v]) => v && typeof v === 'object').map(([m, cells]) => `${m}: ${Object.entries(cells).sort().map(([mc, c]) => `${mc} ${Math.round(Object.values(c).reduce((t, x) => t + x, 0) * 100) / 100}`).join(', ')}`);
      console.log(`${sport}: who absorbs the work missing: ${ab.events} fresh absences, ${ab.quiet} games with none${ab.read === false ? ' (not read: off the search, project.mjs TRY_VL)' : ab.ready ? '' : ' (not ready: the split in proportion in its place)'}; each class's taken: ${sums.join('; ')}`);
    }
    // (each stat's matchup terms kept, and what each did for the held-out games' log loss)
    for (const [key, f] of Object.entries(r.props ?? {})) {
      const kept = Object.entries(f.gains ?? {}).map(([k, g]) => `${k} ${f.params[k] ?? 0}${k === 'vc' ? `/${f.params.vs}` : k === 'sn' && f.params.sn ? `/sr ${f.params.sr}` : k === 'vl' && f.params.vl ? `/vs ${f.params.vs}/vc ${f.params.vc}` : k === 'po' && f.params.po ? `/pg ${f.params.pg ?? 0}/a ${f.params.a}` : k === 'vol' && f.params.vol ? `/yk ${f.params.yk}` : k === 'mk' && f.params.mk ? `/b ${f.params.b}` : k === 'rp' && f.params.rp ? `/nu ${f.params.nu}` : k === 'ij' && (f.params.ij || f.params.ir) ? `/ia ${f.params.ia}/ir ${f.params.ir}` : ''} (${g === null ? 'not taken' : g > 0 ? `+${g}${k === 'dp' && !f.params.dp ? `, left out: ${f.rookie?.fails?.join(', ') || 'its own worse'}` : f.floors?.[k] ? `${f.params[k] ? '' : `, left out at ${f.floors[k].size}: ${f.floors[k].fails.join(', ')}`}, bias ${f.floors[k].bias[0]} to ${f.floors[k].bias[1]}${f.floors[k].on ? `, its own ${f.floors[k].on[0]?.n ?? 0} rows ${f.floors[k].on[0]?.bias ?? 'n/a'} to ${f.floors[k].on[1]?.bias ?? 'n/a'} (actual over projected ${f.floors[k].on[0]?.ratio ?? 'n/a'} to ${f.floors[k].on[1]?.ratio ?? 'n/a'}; the eligible's ${f.floors[k].onElig?.[0]?.n ?? 0} ${f.floors[k].onElig?.[0]?.ratio ?? 'n/a'} to ${f.floors[k].onElig?.[1]?.ratio ?? 'n/a'}), the rest ${f.floors[k].rest[0]} to ${f.floors[k].rest[1]}` : ''}${f.floors[k].sides ? `, the favorites' ${f.floors[k].sides[0][0]?.n ?? 0} rows ${f.floors[k].sides[0][0]?.bias ?? 'n/a'} to ${f.floors[k].sides[0][1]?.bias ?? 'n/a'}, the underdogs' ${f.floors[k].sides[1][0]?.n ?? 0} ${f.floors[k].sides[1][0]?.bias ?? 'n/a'} to ${f.floors[k].sides[1][1]?.bias ?? 'n/a'}` : ''}` : ''}` : `${g}, left out${f.floors?.[k] ? ` at ${f.floors[k].size}` : ''}`})`);
      // (and its held-out check: the eligible players' log loss at lines at their median, the bias a game
      // (projected less actual) theirs and every player's)
      if (f.check) kept.push(`held out: log loss ${f.check.logLoss}, bias ${f.check.bias}, all players' bias ${f.checkAll?.bias ?? 'n/a'}`);
      // (the held-out fifths by projection, lowest first: actual over projected less 1, without the pull toward
      // the middle (sl) and with it where it was tried, then the check as fit (the draft's prior after it); and the
      // recalibration by side's (cs): each side's log loss
      // (a line under the projection, then at it or over) and the skew's rows (a side taken against its own
      // projection: the model's chance of it, how often it won), with cal alone then by side (cal alone where it
      // isn't tried: project.mjs TRY_CS))
      const fifths = (x) => (x ? x.map((q) => q.ratio).join('/') : 'n/a');
      const sl = f.floors?.sl;
      kept.push(sl?.fifths ? `fifths ${fifths(sl.fifths[0])} to ${fifths(sl.fifths[1])}${sl.exact ? ' (each size replayed)' : ''}, final ${fifths(f.check?.fifths)}` : `fifths ${fifths(f.check?.fifths)}`);
      // (the early exit's gate (project.mjs ex): the held-out eligible rows' chance of a short game and what one
      // keeps, the low lines' log loss (LOW_LINE or under), the high rows' (a short last game, a first game back, a
      // chance of 10% or more: log loss, over said and was) and the whole stat's without it and at the size the
      // search took, the dispersion r each)
      const ex = f.floors?.ex;
      const ll = (x) => (x ? `${x.logLoss ?? 'n/a'} (${x.lines})` : 'n/a');
      const hi = (x) => (x ? `${x.logLoss ?? 'n/a'} said ${x.said ?? 'n/a'} was ${x.was ?? 'n/a'} (${x.lines})` : 'n/a');
      if (ex) kept.push(`early exit at ${ex.size}: chance ${ex.q ?? 'n/a'} keeping ${ex.f ?? 'n/a'} (${ex.n} rows), low lines ${ll(ex.low[0])} to ${ll(ex.low[1])}, high rows ${hi(ex.high?.[0])} to ${hi(ex.high?.[1])}, all ${ex.logLoss[0]} to ${ex.logLoss[1]}, r ${ex.r[0]} to ${ex.r[1]} (${ex.seconds}s)${ex.fails.length ? `, left out: ${ex.fails.join(', ')}` : ''}`);
      // (the start-of-season prior's gate (project.mjs sp): the held-out early games it's judged on (his first 4 of a
      // season, a run of his own before it), their log loss at the early lines and actual over projected without it
      // and at the size the search took, the whole stat's log loss, its seconds, the fit window's early games; and its
      // table as the history leaves it, each level's read (under 0: the prior's games ran under the stat's level), its
      // games and their worth at the prior's weight (ne: (sum w)^2 / sum w^2, a December game little), the cells with
      // 50 games' worth. Its lines a naive book's (his usual): the gain an upper bound on the edge at real lines)
      const sp = f.floors?.sp;
      if (sp || f.start) {
        const lv = Object.entries(f.start?.table ?? {}).filter(([k, c]) => !k.includes('|') || (c.ne ?? c.n) >= 50).sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => `${k} ${c.g} (${c.n}, worth ${c.ne ?? 'n/a'})`).join(', ');
        kept.push(`start-of-season prior at ${sp?.size ?? 0}: ${sp?.held ?? f.start?.held ?? 0} early games held out, ${sp?.fit ?? f.start?.fit ?? 0} on the fit window${sp?.early ? `, their lines (his usual, no book's shade) ${ll(sp.early[0])} to ${ll(sp.early[1])}, actual over projected ${sp.early[0]?.ratio ?? 'n/a'} to ${sp.early[1]?.ratio ?? 'n/a'} (${sp.early[1]?.n ?? 0}), all ${sp.whole[0]} to ${sp.whole[1]}` : ''}${sp?.seconds ? ` (${sp.seconds}s)` : ''}${sp?.fails?.length ? `, left out: ${sp.fails.join(', ')}` : ''}; levels ${lv || 'none'}`);
      }
      const cs = f.floors?.cs;
      const sides = (x) => (x ? x.map((s) => `${s.logLoss ?? 'n/a'} (${s.lines})`).join(' / ') : 'n/a');
      const skew = (x) => (x?.n ? `${x.n} said ${x.said} won ${x.was}` : 'none');
      if (cs) kept.push(cs.size === null && cs.fails?.[0] === 'not tried' ? `by side ${sides(cs.bySide[0])}, skew rows ${skew(cs.skew[0])} (by side not tried)` : `by side ${sides(cs.bySide[0])} to ${sides(cs.bySide[1])}, skew rows ${skew(cs.skew[0])} to ${skew(cs.skew[1])}`);
      // (the draft's prior's gate, its own numbers: without it, then at the size the search took (dp), each at
      // its own dispersion r: the eligible players' held-out games, every player's bias, the players in their
      // first season and first two, and those two seasons' early games (under 3 of his own: bias and error))
      const rk = f.rookie;
      const two = (x) => (x?.[0] && x?.[1] ? `${x[0].logLoss} to ${x[1].logLoss}, bias ${x[0].bias} to ${x[1].bias} (${x[1].lines} lines of ${x[1].n})` : 'n/a');
      const bias = (x) => (x?.[0] && x?.[1] ? `bias ${x[0].bias} to ${x[1].bias}, error ${x[0].mae} to ${x[1].mae} (${x[1].n} games)` : 'n/a');
      if (rk) kept.push(`draft dp ${rk.dp}${rk.dp && !rk.kept ? ' (left out)' : ''}, r ${rk.r?.[0]} to ${rk.r?.[1]}: eligible ${two(rk.check)}, all players' ${bias(rk.all)}, rookies ${two(rk.rookie)}, first two seasons ${two(rk.young)}, their early games ${bias(rk.early)}`);
      if (kept.length) console.log(`${sport}:   ${key}: ${kept.join(', ')}`);
    }
  } catch (err) {
    console.warn(`${sport}: props left out (${err.stack ?? err})`);
  }
}

// 2c'. the posted inactives (context.mjs gather: the NFL's and NBA's game-day rosters near the start, the listed
// ones already in their games' injury reports) with the regulars the report doesn't list put in too, now the rows
// say who's a regular (timing.mjs lineupNow: work in two of his team's last four games of this season, two of
// them at least): the props read them out and an open prop's inputs (repriceOpen: the inactives' part ina, the
// NBA's starting five against the usual one, st) see the news. The game lines' context was fit on the listed
// ones alone (a regular left off the report is rare), so a game line's bet isn't priced again on ina or st
// (timing.mjs PROPS_ONLY). Any failure: the report as it was
function inactivesNow(r) {
  r.players = null;
  try {
    r.players = lineupNow(r.rows, r.sport);
    if (!r.players) return;
    const put = (r.upcoming ?? []).flatMap(({ game }) => putInactives(r.live?.get(game.id), game, r.players).map((x) => `${x.name} (${game.awayAbbr} @ ${game.homeAbbr})`));
    if (put.length) console.log(`${r.sport}: regulars inactive the injury report doesn't list, now out: ${put.join(', ')}`);
  } catch (err) {
    console.warn(`${r.sport}: inactives not put in (${err.message})`);
  }
}

// 2d. the backtest (backtest.mjs): with --backtest, the plan's historical snapshots bought (within history's
// budget) and the bets drawn from them saved (backtest.json, committed); every run, the saved bets read back,
// each market's numbers worked out for the state, and the bets kept for the trust fit
async function runBacktest(r) {
  const { sport, history, params } = r;
  if (BACKTEST && hasKey()) {
    const t0 = Date.now();
    const { snaps, bought, planned } = await snapshots(sport);
    const bets = backtestBets(sport, snaps, history, r.expAll, params, r.facts.teams ?? [], START_TRUST, EV_SCALE, r.shape);
    writeIfChanged(r.files.backtest, { at: r.at, planned, snapshots: snaps.length, bets });
    console.log(`${sport}: backtest on ${snaps.length} of ${planned} snapshots (${bought} bought), ${bets.length / 2} bets a side, in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  const saved = read(r.files.backtest, null);
  // (their chances priced again by the desk's pricing now: backtest.mjs repriced)
  const bets = repriced(saved?.bets ?? [], r.expAll ?? new Map(), params, r.shape);
  if (saved?.bets?.length && bets.length < saved.bets.length) console.log(`${sport}: backtest bets priced again: ${bets.length} of ${saved.bets.length} (the rest's games not in the replay)`);
  r.backtestBets = trustBets(bets);
  r.backtest = saved ? { at: saved.at, snapshots: saved.snapshots, planned: saved.planned, markets: evaluate(bets) } : null;
}

// The context as the state shows it; logged: a term joining or leaving, or its size moving a tenth or more
// (the first fit logs each it keeps)
function logContext(r) {
  const { ctxFit, state, at } = r;
  r.context = ctxFit ? contextState(ctxFit, r.weights) : (state.context ?? null);
  if (!ctxFit) return;
  const was = new Map((state.context?.terms ?? []).map((t) => [t.key, t]));
  const why = `on ${ctxFit.after.n} games it hadn't seen: margins off by ${round(ctxFit.after.maeMargin)} (${round(ctxFit.before.maeMargin)} without the context), totals by ${round(ctxFit.after.maeTotal)} (${round(ctxFit.before.maeTotal)}), winners ${round(ctxFit.after.winHit * 100, 1)}% right (${round(ctxFit.before.winHit * 100, 1)}%)`;
  for (const t of r.context.terms) {
    const from = was.get(t.key) ?? { size: 0, kept: false };
    const moved = Math.abs(t.size - from.size) >= 0.1 * Math.max(Math.abs(t.size), Math.abs(from.size));
    if (from.kept !== t.kept || (t.kept && moved)) state.changelog.push({ at, what: `context: ${t.label}${t.kept ? '' : ' (left out)'}`, from: from.size, to: t.size, why });
  }
}

// 3. each market's trust in the model, and each prop type's in its projection, refit on its graded bets
function refitTrust(r) {
  const { state, at } = r;
  const trust = { ...(state.trust ?? {}) };
  const refit = (key, bets, words) => {
    const t = fitTrust(bets, START_TRUST);
    if (trust[key] && trust[key].trust !== t.trust) state.changelog.push({ at, what: words.what, from: trust[key].trust, to: t.trust, why: `best fit to ${t.n} graded ${words.bets} and ${t.clvN} closing lines, ${t.eff} games' worth (log loss ${t.logLoss})` });
    trust[key] = t;
  };
  // (each one's bets with a result or a close, a void one's neither: clv.mjs; and a market's backtest bets, the
  // history's real lines and results, so its trust is fitted from the start, the live bets adding to them as
  // they come)
  // (and placed under this model: since MODEL_EPOCH, leagues.mjs; an older model's bets stay on the record but
  // don't judge this one)
  const epoch = Date.parse(MODEL_EPOCH);
  const evidence = (b) => !b.void && (b.status !== 'open' || b.clv) && Date.parse(b.placedAt ?? b.start) >= epoch;
  // (the backtest's at BACKTEST_WEIGHT: tw, a copy's)
  const backtest = (r.backtestBets ?? []).map((b) => ({ ...b, tw: (b.tw ?? 1) * BACKTEST_WEIGHT }));
  // (a game bet's fair chance from Pinnacle only, as the backtest's are (backtest.mjs trustBets): one priced off
  // DraftKings' own odds (ESPN's board inside LAST_CALL, or no Pinnacle line) has no sharp price to weigh the
  // model against, and would teach the trust a softer market)
  const sharp = (b) => b.fairFrom === 'pinnacle';
  // (a live bet placed well before its window opened (from before the desk waited for the news: priced on a
  // guess at who'd play, which the backtest's close and the bets placed near the news aren't) counts at
  // EARLY_WEIGHT: tw, a copy's, the ledger's bet untouched)
  const timed = (b, kind) => {
    const lead = Date.parse(b.start) - Date.parse(b.placedAt ?? b.start);
    const win = (TIMING[r.sport]?.[kind] ?? Infinity) * 36e5;
    return lead > win + EARLY_SLACK ? { ...b, tw: EARLY_WEIGHT } : b;
  };
  // (the live bets' chances priced again by the desk's pricing now, as the backtest's are (backtest.mjs
  // repriced), each from the expectation it was bet on: one placed under an older pricing (the plain normal's
  // underdog-leaning moneyline) would teach the trust that pricing's leans. One with no expectation kept, or a
  // moneyline with no spread to price it off, is left out)
  const live = repriced(
    r.ledger.bets.filter((b) => MARKETS.includes(b.market)),
    (b) => (Number.isFinite(b.expMargin) && Number.isFinite(b.expTotal) ? { margin: b.expMargin, total: b.expTotal } : null),
    r.params,
    r.shape,
  )
    .filter((b) => sharp(b) && evidence(b))
    .map((b) => timed(b, 'lines'));
  for (const market of MARKETS) {
    refit(market, [...backtest.filter((b) => b.market === market), ...live.filter((b) => b.market === market)], { what: `${market} trust in the model`, bets: `${market} bets (backtest and live)` });
    trust[market].backtest = (r.backtestBets ?? []).filter((b) => b.market === market).length;
  }
  // (start 0.5, refit once 40 of its bets are graded)
  for (const st of STATS[r.sport]) {
    refit(
      `prop:${st.key}`,
      r.ledger.bets.filter((b) => b.market === 'prop' && b.propType === st.key && evidence(b)).map((b) => timed(b, 'props')),
      { what: `${st.label} props' trust in the projection`, bets: `${st.label} props` },
    );
  }
  r.trust = trust;
}

// 3b. each bet's close, once its game has started (the core API keeps it after kickoff), and its CLV
// (clv.mjs); a close the API never gives (it's failed for 3 days) is taken as the last line a run saw
async function captureClose(r) {
  const { sport, cfg, games, params } = r;
  // (not a void bet's, nor one on a game called off: no action, so no close)
  const started = r.ledger.bets.filter((b) => !b.clv && !b.void && !games.get(b.event)?.off && Date.parse(b.start) <= r.now.getTime());
  const events = [...new Set(started.map((b) => b.event))];
  let got = 0;
  for (const id of events) {
    const mine = started.filter((b) => b.event === id);
    const game = games.get(id);
    try {
      const lines = mine.some((b) => b.market !== 'prop') ? await closingLines(cfg.league, id) : null;
      const props = mine.some((b) => b.market === 'prop') && game ? await board(sport, cfg.league, game) : [];
      // (the line log: the board and the game's lines read once the game's started, their own src 'c' (linelog.mjs):
      // a fit reading the log for a pre-game line drops them, as it drops any row from the start on)
      (r.lineRows ??= []).push(...propRows(id, props, 'c'), ...gameRows(id, lines, 'c'));
      for (const bet of mine) {
        let close = bet.market === 'prop' ? propCloseOf(bet, props) : closeOf(bet, lines);
        if (close) close.source = 'close';
        // (a prop whose board kept no price (the NFL's): the line and price The Odds API gave near the start)
        if (bet.market === 'prop' && close && close.odds === null && bet.seen && Date.parse(bet.start) - Date.parse(bet.seen.at) < 3 * 36e5) close = { ...bet.seen, source: 'odds api near the start' };
        // (none read for 3 days: the last line a run saw; a close read late, the runs having stopped, is kept)
        else if (!close && bet.seen && r.now.getTime() - Date.parse(bet.start) > 3 * DAY) close = { ...bet.seen, source: 'last seen' };
        if (!close) continue;
        bet.close = close;
        bet.clv = clvOf(bet, close, bet.market === 'total' ? params.sigmaT : params.sigma, bet.market === 'prop' ? null : { sigma: params.sigma, sigmaT: params.sigmaT, shape: r.shape });
        got++;
      }
    } catch (err) {
      console.warn(`${sport}: close for ${id} not read (${err.message})`);
    }
  }
  if (started.length) console.log(`${sport}: closing lines for ${got} of ${started.length} bets on games under way or played`);
}

// 4. the open bets graded against their finals (a prop from its box score: a player who didn't play is no
// action), and each graded bet's post-mortem; first, the bets on games called off: void, or noted as put off
// till they're played or 48 hours have gone by (desk.mjs voidOf)
async function gradeBets(r) {
  const { sport, cfg, games, at } = r;
  for (const bet of r.ledger.bets) {
    if (bet.status !== 'open') continue;
    const g = games.get(bet.event);
    if (g?.off && g.off !== 'canceled' && g.off !== 'forfeit') bet.off ??= g.off;
    const voided = voidOf(bet, g, r.now.getTime());
    if (!voided) continue;
    Object.assign(bet, voided, { gradedAt: at });
    r.graded++;
  }
  for (const bet of r.ledger.bets) {
    if (bet.status !== 'open' || bet.market === 'prop') continue;
    const g = games.get(bet.event);
    if (!g?.final || g.hs === null) continue;
    Object.assign(bet, settle(bet, g), { gradedAt: at });
    r.graded++;
  }
  for (const bet of r.ledger.bets) {
    if (bet.status !== 'open' || bet.market !== 'prop') continue;
    const g = games.get(bet.event);
    if (!g?.final || g.hs === null) continue;
    try {
      const body = await finalSummary(sport, cfg.league, g.id);
      if (!body) continue;
      const value = await statInFinal(sport, bet, body, r.facts.games?.[g.id]?.pk, { played: (b) => nflTookSnap(r.facts, g.id, b.player, b.athlete) });
      // (a count that can't be read yet waits: the NFL's snap counts a day or so after the game, StatsAPI's box
      // score; past PROP_WAIT, no action)
      if (value === undefined && r.now.getTime() - Date.parse(bet.start) < PROP_WAIT) continue;
      Object.assign(bet, value === undefined ? { status: 'push', profit: 0, void: true, actual: null, final: 'stat not read' } : settleProp(bet, value), { gradedAt: at });
      Object.assign(bet, propPostmortem(sport, bet, g, body, r.rows, DISRUPTED_WEIGHT, await usualRoles(sport, g, r.facts, r.history).catch(() => null)));
      r.graded++;
    } catch (err) {
      console.warn(`${sport}: prop ${bet.id} not graded (${err.message})`);
    }
  }
  await gradeChecks(r);
  await statCorrections(r);
  // (the ones just graded, and any graded before there were post-mortems; once, when the rule for a broken
  // premise changes (PM_RULE), the ones it weighed down, again)
  const redo = r.state.postmortemRule !== PM_RULE ? r.ledger.bets.filter((b) => b.status !== 'open' && !b.void && b.why && (b.weight ?? 1) < 1) : [];
  try {
    const todo = r.ledger.bets.filter((b) => b.status !== 'open' && b.market !== 'prop' && (!b.why || redo.includes(b)));
    if (todo.length) console.log(`${sport}: post-mortems for ${await postmortems(sport, cfg.league, todo, games, r.facts, r.history, DISRUPTED_WEIGHT)} of ${todo.length} graded bets`);
    for (const bet of redo.filter((b) => b.market === 'prop')) {
      const g = games.get(bet.event);
      const body = g?.final ? await finalSummary(sport, cfg.league, g.id) : null;
      if (body) Object.assign(bet, propPostmortem(sport, bet, g, body, r.rows, DISRUPTED_WEIGHT, await usualRoles(sport, g, r.facts, r.history).catch(() => null)));
    }
    if (redo.length) console.log(`${sport}: ${redo.length} post-mortems weighed again by the new rule (${redo.filter((b) => (b.weight ?? 1) === 1).length} now count in full)`);
    r.state.postmortemRule = PM_RULE;
  } catch (err) {
    console.warn(`${sport}: post-mortems skipped (${err.message})`);
  }
}

// 4b. stat corrections: a prop graded on a final's first box score has the summary read once more, a day and a
// half after the start (postmortem.mjs recheckSummary: the leagues' corrections are in by then), and a count
// that changed is noted on the bet (corrected: the count now, and when) but not graded again: DraftKings
// settles a prop on the official count at the final and doesn't settle it again for a later correction, so
// the desk's record stays the book's. Only the last five days' props; one whose summary was first read that
// late is done
async function statCorrections(r) {
  const { sport, cfg, games, at } = r;
  const now = r.now.getTime();
  const due = r.ledger.bets.filter((b) => b.market === 'prop' && b.status !== 'open' && !b.void && !b.rechecked && now - Date.parse(b.start) >= RECHECK && now - Date.parse(b.start) < 5 * DAY);
  let changed = 0;
  for (const id of new Set(due.map((b) => b.event))) {
    const g = games.get(id);
    if (!g?.final) continue;
    try {
      const got = await recheckSummary(sport, cfg.league, id, g.date, now);
      if (!got) continue;
      for (const bet of due.filter((b) => b.event === id)) {
        if (got.body) {
          const value = await statInFinal(sport, bet, got.body, r.facts.games?.[g.id]?.pk, { played: (b) => nflTookSnap(r.facts, g.id, b.player, b.athlete) });
          if (value === undefined) continue;
          if (value !== bet.actual) {
            bet.corrected = { actual: value, at };
            changed++;
          }
        }
        bet.rechecked = at;
      }
    } catch (err) {
      console.warn(`${sport}: stat corrections for ${id} not read (${err.message})`);
    }
  }
  if (changed) console.log(`${sport}: ${changed} props' counts corrected in the box score since (noted; graded as the book graded them, at the final)`);
}

// 4c. the CHECKs (checks.mjs: the markets too far from the book to bet, kept anyway) graded as a bet would be,
// at a unit, once their games are final (void the same way when called off; a prop's count waiting PROP_WAIT
// at most): their result (checkResult) is what they'd have done, never in the record
async function gradeChecks(r) {
  const { sport, cfg, games, at } = r;
  let n = 0;
  for (const c of r.ledger.checks ?? []) {
    if (c.checkResult) continue;
    const g = games.get(c.event);
    try {
      const voided = voidOf(c, g, r.now.getTime());
      if (voided) {
        c.checkResult = checkResultOf(voided, at);
        n++;
        continue;
      }
      if (!g?.final || g.hs === null) continue;
      if (c.market !== 'prop') {
        c.checkResult = checkResultOf(settle(atUnit(c), g), at);
        n++;
        continue;
      }
      const body = await finalSummary(sport, cfg.league, g.id);
      if (!body) continue;
      const value = await statInFinal(sport, c, body, r.facts?.games?.[g.id]?.pk, { played: (b) => nflTookSnap(r.facts, g.id, b.player, b.athlete) });
      if (value === undefined && r.now.getTime() - Date.parse(c.start) < PROP_WAIT) continue;
      c.checkResult = checkResultOf(value === undefined ? { status: 'push', profit: 0, void: true, actual: null, final: 'stat not read' } : settleProp(atUnit(c), value), at);
      n++;
    } catch (err) {
      console.warn(`${sport}: CHECK ${c.id} not graded (${err.message})`);
    }
  }
  if (n) console.log(`${sport}: ${n} CHECKs graded (what they'd have done, out of the record)`);
}

// (--replace: the open bets on games not started yet (more than REPRICE_BY off: one taken back closer might
// not be placed again in time) taken back, to be priced again with what the model knows now; logged once the
// new ones are placed. A game not yet in its window (leagues.mjs TIMING) is bet again once it is. A pick the
// Bets page shows is taken back too: it's published only once locked (picks.mjs), and the ones published
// before were made shown again (unlock). The games whose props it took back are owed an ask of The Odds API
// (betProps: the NFL's board has no prices of its own, so without one they'd never be bet again); an NFL
// game's props are left as they are when today's props allowance can't pay for its ask (propsAffordable)
function replaceOpen(r) {
  r.replaced = 0;
  r.replacedProps = new Set();
  if (REPLACE && !DRY) {
    const before = r.ledger.bets.length;
    const due = (b) => b.status === 'open' && Date.parse(b.start) - Date.now() > REPRICE_BY && !b.published;
    const keepProps = propsAffordable(r, r.ledger.bets.filter((b) => due(b) && b.market === 'prop'));
    const gone = (b) => due(b) && !(b.market === 'prop' && keepProps.has(b.event));
    for (const b of r.ledger.bets) if (gone(b) && b.market === 'prop') r.replacedProps.add(b.event);
    const kept = r.ledger.bets.filter((b) => b.status === 'open' && Date.parse(b.start) - Date.now() > REPRICE_BY && b.published).length;
    r.ledger.bets = r.ledger.bets.filter((b) => !gone(b));
    r.replaced = before - r.ledger.bets.length;
    if (kept) console.log(`${r.sport}: ${kept} open bets published (locked) left as they are`);
    if (keepProps.size) console.log(`${r.sport}: props left as they are in ${keepProps.size} games: today's Odds API props allowance can't pay to ask for them again`);
  }
  r.placed = new Set(r.ledger.bets.map((b) => b.id));
  // (--dry: what the model made of each coming game, to compare one version of the code with another)
  r.snapshot = { exp: {}, projections: {} };
}

// (the NFL games whose props, if taken back, couldn't be bet again: its board has no prices, so each is owed an
// ask of The Odds API (API_MARKETS' credits); the soonest games first while today's props allowance pays for
// their asks (oddsapi.mjs canSpend), the rest, and any asked PROP_ASKS times already, keep theirs. Other
// sports' boards price their own, and without a key nothing's asked: none kept)
function propsAffordable(r, bets) {
  const keep = new Set();
  if (r.sport !== 'nfl' || !hasKey() || !bets.length) return keep;
  const cost = Object.keys(API_MARKETS.nfl).length;
  const asked = read(PROPS_ASKED, {});
  const games = [...new Map(bets.map((b) => [b.event, b.start]))].sort((a, b) => a[1].localeCompare(b[1]));
  let n = 0;
  for (const [id] of games) {
    if ((asked[id] ?? 0) >= PROP_ASKS || !canSpend('props', (n + 1) * cost)) keep.add(id);
    else n++;
  }
  return keep;
}

// 4b. the open bets priced again on news: each coming game's inputs now (timing.mjs inputsOf; none for a game
// whose context or injury report couldn't be read: blindOf), against the ones each open bet on it was placed
// with (bet.inputs); a bet whose inputs changed, its game more than REPRICE_BY off, is taken back (r.takenBack)
// and priced again by betGames and betProps with what the model knows now, the new bet keeping what it was
// and why (repriced), the changelog the count (saveState). A bet from before the inputs were kept (none on
// it) stays as it is (--replace prices those again); one priced again MAX_REPRICES times already stays too, and
// so does an NFL game's props whose ask of The Odds API today's allowance can't pay for (propsAffordable:
// without it they'd never be bet again). A pick the Bets page shows is priced again like any other (it's
// published only once locked, past REPRICE_BY: picks.mjs). One taken back but not placed again this run is
// kept across runs (TAKEN_BACK), so its count and what it was reach the bet placed later. --dry: the ones it
// would price again, logged (a dry run prices every open bet again anyway)
function repriceOpen(r) {
  const { sport, at } = r;
  r.inputs = new Map();
  r.takenBack = new Map();
  const before = read(INPUTS(sport), {});
  // (a source that failed this run: its parts unread, never a change)
  const ok = { nflverse: r.times?.nflverse?.ok, injuries: r.times?.injuries?.ok, statsapi: r.times?.StatsAPI?.ok };
  const games = new Map();
  for (const { game } of r.upcoming ?? []) {
    games.set(game.id, game);
    if (blindOf(r, game)) continue;
    r.inputs.set(game.id, inputsOf(sport, game, r.live.get(game.id), r.feats?.feats.get(game.id)?.info ?? null, ok, r.players));
  }
  // (--dry: what the inputs read, a part unread (its source failed, or none for the game) by name)
  if (DRY && r.inputs.size) {
    const unread = [...new Set([...r.inputs.values()].flatMap((x) => Object.entries(x.parts).filter(([, v]) => v === null).map(([k]) => k)))];
    const one = [...r.inputs.values()][0].parts;
    console.log(`${sport} (dry): inputs read for ${r.inputs.size} of ${r.upcoming.length} coming games${unread.length ? `, unread: ${unread.join(', ')}` : ''}; the first: ${JSON.stringify(one).slice(0, 300)}`);
  }
  // (each game whose game-day roster is posted: how far into the run its re-price comes and how long before
  // REPRICE_BY, its last chance to be priced again: the inactives are read at the run's start (gather), the
  // re-price only after the fits, so the first Sundays measure whether the run lands in time)
  for (const { game } of r.upcoming ?? []) {
    if (!(r.live?.get(game.id)?.gameRosters?.size > 0)) continue;
    const left = Math.round((Date.parse(game.date) - REPRICE_BY - Date.now()) / 60e3);
    console.log(`${sport}: ${game.awayAbbr} @ ${game.homeAbbr} game-day roster read, its re-price ${Math.round((Date.now() - r.now.getTime()) / 60e3)} minutes into the ${sport} run, ${left} minutes before the lock${left < 0 ? ' (too late: the bets stand as placed)' : ''}`);
  }
  let capped = 0;
  let published = 0;
  for (const b of r.ledger.bets) {
    if (b.status !== 'open' || b.void || !b.inputs) continue;
    if (Date.parse(b.start) - Date.now() < REPRICE_BY) continue;
    const now = r.inputs.get(b.event);
    if (!now) continue;
    const prev = before[b.event];
    const changes = inputChanges(b.inputs, now, { game: games.get(b.event), before: prev?.parts, names: { ...(prev?.names ?? {}), ...now.names }, market: b.market });
    if (!changes.length) continue;
    if (b.published) {
      published++;
      continue;
    }
    if ((b.repriced?.n ?? 0) >= MAX_REPRICES) {
      capped++;
      continue;
    }
    r.takenBack.set(b.id, { bet: b, why: changes.map((c) => c.words) });
  }
  // (an NFL game's props whose ask can't be paid for today: left as they are)
  const owedAlready = read(PROPS_ASKED, {});
  const keepProps = propsAffordable(
    r,
    [...r.takenBack.values()].map((x) => x.bet).filter((b) => b.market === 'prop' && !owedAlready[`${b.event}:owed`]),
  );
  for (const [id, x] of r.takenBack) if (x.bet.market === 'prop' && keepProps.has(x.bet.event)) r.takenBack.delete(id);
  if (keepProps.size) console.log(`${sport}: props' inputs changed in ${keepProps.size} games, left as they are (today's Odds API props allowance can't pay to ask for them again)`);
  if (capped) console.log(`${sport}: ${capped} open bets' inputs changed, left as they are (priced again ${MAX_REPRICES} times already)`);
  if (published) console.log(`${sport}: ${published} open bets' inputs changed, left as they are (published: locked)`);
  // (the ones taken back in earlier runs and not placed again since: still to come, and not on the ledger now)
  r.backKept = new Map(Object.entries(read(TAKEN_BACK(sport), {})).filter(([id, x]) => Date.parse(x.start) > Date.now() && !r.placed.has(id)));
  for (const [id, x] of r.takenBack) r.backKept.set(id, backOf(x.bet, x.why));
  if (r.takenBack.size) {
    const word = DRY ? 'would be priced again' : 'taken back to price again';
    console.log(`${sport}: ${r.takenBack.size} open bets ${word} on news: ${[...new Set([...r.takenBack.values()].map((x) => `${x.bet.matchup} (${x.why.join('; ')})`))].join(' | ')}`);
  }
  if (!DRY) {
    r.ledger.bets = r.ledger.bets.filter((b) => !r.takenBack.has(b.id));
    for (const id of r.takenBack.keys()) r.placed.delete(id);
    write(TAKEN_BACK(sport), Object.fromEntries(r.backKept));
    // (each coming game's inputs as seen now, for the next run's words on who joined or left a list)
    write(INPUTS(sport), Object.fromEntries([...r.inputs].map(([id, x]) => [id, { at, parts: x.parts, names: x.names }])));
  }
}

// (a bet taken back, as kept till it's placed again: its count so far, why, what it was)
function backOf(bet, why) {
  return { n: bet.repriced?.n ?? 0, why, from: { side: bet.side, line: bet.line, odds: bet.odds, units: bet.units, placedAt: bet.placedAt }, event: bet.event, market: bet.market, start: bet.start };
}

// (what a new bet keeps of its game's inputs and, priced again on news, of the bet it replaces: taken back
// this run or an earlier one (r.backKept), so a bet held a run still counts toward MAX_REPRICES)
function stampOf(r, id, gameId) {
  const inputs = r.inputs?.get(gameId)?.hash;
  const back = r.backKept?.get(id);
  return {
    ...(inputs ? { inputs } : {}),
    ...(back && !DRY ? { repriced: { n: back.n + 1, why: back.why, from: back.from } } : {}),
  };
}

// 5. every market of the coming games, bet once: the better side at 0.5 to 3 units, cut or skipped by the
// guard, skipped when the model is too far from the book (desk.mjs gapGuard); the spread and the moneyline
// never on the same side of a game (desk.mjs oneSide, among the markets the guards didn't skip: the one giving
// way takes the other side only with an edge there); a moneyline with no spread to price it off tracked, not
// bet, for the data; only an edge is bet, the rest tracked (desk.mjs placement); each bet keeps the context it saw, and waits in r.pending for placeBets (the game's cap). Not
// bet this run (asked again the next): a game not yet in its window, or in it but waiting for its news till the
// last chance (leagues.mjs TIMING, timing.mjs: at the last chance bet with what's known, the missing news a flag
// that cuts it to the minimum), a game whose context or injury report couldn't be read (blindOf: it
// would be bet as if everyone were healthy), one starting within five minutes by the clock now, and, with The
// Odds API to hand, one it didn't price this run (no sharp fair chance: it waits for one, and only inside
// LAST_CALL of its start goes on ESPN's board, tracked, not bet). A market the guard
// skips, or the book doesn't price, rests (liveLines). Each bet keeps the inputs it was priced on (stampOf), so
// a change before the start prices it again (repriceOpen)
function betGames(r) {
  const { sport, cfg, params, trust, at } = r;
  const held = new Map();
  r.pending = [];
  // (this run's CHECKs, game markets' and props': recordChecks; and the markets it priced that the gap guard
  // didn't skip, whose CHECKs are closed: checks.mjs closeChecks)
  r.checks = [];
  r.unchecked = new Set();
  for (const { game, lines } of r.upcoming) {
    const { exp, f, adjM, adjT } = expectFor(r, game);
    const fairFrom = lines.fairSource ?? {};
    r.snapshot.exp[game.id] = [round(exp.margin, 4), round(exp.total, 4)];
    const seen = f ? { ...f.info, adj: { margin: round(adjM, 2), total: round(adjT, 2) }, move: lines.move ?? null } : { move: lines.move ?? null };
    const blind = blindOf(r, game);
    // (the time to its start by the clock now, for the five-minute guard; by the run's clock, r.now, for its
    // phase and the last call, as liveLines judged which lines to buy)
    const until = Date.parse(game.date) - Date.now();
    const ahead = Date.parse(game.date) - r.now.getTime();
    const apiLines = lines.source === 'the odds api';
    const waiting = hasKey() && !apiLines && ahead >= lastCall(r);
    // (its timing: before its window, not bet; inside it, waiting for the news it lacks till the last chance,
    // then bet with what's known, flagged: leagues.mjs TIMING)
    const phase = phaseOf(sport, 'lines', ahead, r.gap);
    const news = newsMissing(sport, r.live?.get(game.id), { kind: 'lines' });
    const notYet = phase === 'early' ? 'not in its window yet' : news.length && phase !== 'last' ? `waiting for the news: ${news.join(', ')}` : null;
    const priced = price(game, exp, lines, params, r.shape);
    // (every market priced, both sides, on the betting board: writeBoard)
    (r.boardGames ??= new Map()).set(game.id, { game, markets: boardMarkets(priced, (m) => trust[m]?.trust ?? START_TRUST, lines.consensus), at });
    // (a market the book didn't price, by The Odds API's word: rests)
    if (apiLines && !notYet) for (const m of MARKETS) if (!priced.some((x) => x.market === m) && !r.placed.has(`${game.id}:${m}`)) rest(r, `${game.id}:${m}`, 'not priced by the book');
    let picks = [];
    for (const market of priced) {
      const id = `${game.id}:${market.market}`;
      if (r.placed.has(id) && !DRY) {
        // (a bet already placed: the line this run saw for its side, the stand-in for its close)
        const bet = r.ledger.bets.find((b) => b.id === id);
        const s = market.sides.find((x) => x.side === bet?.side);
        if (bet && s) bet.seen = { at, line: s.line ?? null, odds: s.odds, fair: round(s.fair, 4) };
        continue;
      }
      const hold = notYet ?? blind ?? (until < 5 * 60e3 ? 'starting' : waiting ? 'no Odds API price yet' : null);
      if (hold) {
        held.set(hold, (held.get(hold) ?? 0) + 1);
        continue;
      }
      picks.push({ market: market.market, id, pick: choose(market, trust[market.market]?.trust ?? START_TRUST, EV_SCALE) });
    }
    // (the guards: the model too far from the book skips the market (desk.mjs gapGuard: the market knowing
    // something it doesn't); a line that's moved a lot against its side since it opened (less what the context
    // explains), or a key player questionable, cuts the stake to the minimum; a line that's moved twice that
    // far against it skips the market this run. A moneyline with no spread market to anchor it (margins.mjs
    // mlModel) is priced at the book's chance alone, tracked, not bet (once the minimum, an action bet))
    // (an NFL total under the weather the model can't price well: a forecast of a fifth of an inch of rain or
    // more over the game (the rain term's size is from what fell, and a big forecast's error is big), or a
    // retractable roof not yet said open or closed (its weather unknown), cut to the minimum too)
    const wx = sport === 'nfl' ? f?.info.weather : null;
    const totalWhy = wx?.roof === 'retractable' ? 'a retractable roof not yet said open or closed: its weather unseen' : wx?.precipForecast >= 0.2 ? `${wx.precipForecast} in of rain forecast: a total priced off a forecast's rain` : null;
    // (either side's unit flagged by the news (news.mjs: a change of play-caller, coordinator or head coach, a
    // benching, in its next games; or an owner's note on the team): the game's lines at the minimum stake)
    const teamNewsWhy = newsWords(r.live?.get(game.id), (t) => (String(t) === String(game.home) ? game.homeAbbr : game.awayAbbr));
    const guardFor = (key, pick) => {
      const flags = [...(f?.info.flags ?? []), ...(key === 'total' && totalWhy ? [totalWhy] : []), ...(news.length ? [`bet at the last chance before the news: ${news.join(', ')}`] : []), ...teamNewsWhy];
      // (the gap's skip a CHECK only when it's the gap alone: another guard's skip (a line moved twice the
      // limit) wins, with both its words, so the CHECKs' hit rate is the gap's)
      const gap = gapGuard(key, pick.model, pick.fair);
      const other = guardOf(cfg.guard, key, lines.move, flags, { m: adjM, t: adjT }, params.sigma, pick.side);
      const g = gap && other?.skip ? { ...other, why: `${gap.why}; ${other.why}` } : (gap ?? other);
      if (g?.skip || pick.anchored !== false) return g;
      return { why: [g?.why, 'no spread market to price the moneyline off'].filter(Boolean).join('; ') };
    };
    // (an owner's note on the game: its words on what's bet, checks.mjs and notes.mjs)
    const noted = noteWords(r.live?.get(game.id));
    // (one skipped for the model's distance from the book alone (gapGuard's kind 'gap'): kept on the model's own
    // side, not bet, a shadow (checks.mjs shadowOf: the gap's a PASS, graded, never shown; recordChecks))
    const checkFor = (key, id, pick, guard) => {
      const s = pick.other ? modelSide([pick, pick.other]) : pick;
      const c = checkOf(
        {
          id,
          event: game.id,
          sport,
          start: game.date,
          placedAt: new Date().toISOString(),
          matchup: `${game.awayAbbr} @ ${game.homeAbbr}`,
          market: key,
          side: s.side,
          line: s.line,
          odds: s.odds,
          otherOdds: s.other?.odds ?? null,
          model: round(s.model, 4),
          fair: round(s.fair, 4),
          p: round(s.p, 4),
          ev: round(s.ev, 4),
          ...(s.push ? { push: round(s.push, 4) } : {}),
          expMargin: round(exp.margin, 2),
          expTotal: round(exp.total, 2),
          book: lines.book,
          fairFrom: fairFrom[key] ?? 'its own prices',
          ...consensusOn(lines, key, s.side),
          context: { ...seen, ...(noted.length ? { ownerNotes: noted } : {}) },
        },
        // (the guard's words for the model's side: the skip was judged on the side the price favored)
        gapGuard(key, s.model, s.fair) ?? guard,
      );
      c.pick = pickText(c, game);
      r.checks.push(c);
    };
    const skipped = (key, id, guard, pick) => {
      rest(r, id, guard.why);
      if (guard.kind === 'gap' && pick) checkFor(key, id, pick, guard);
      if (DRY) console.log(`${sport} (dry) skipped ${game.awayAbbr} @ ${game.homeAbbr} ${key}: ${guard.why}${guard.kind === 'gap' ? ' (a PASS, kept as a shadow)' : ''}; ${JSON.stringify(seen)}`);
    };
    // (the skips first, so a market the guard skips never makes the other give way: oneSide)
    picks = picks.filter((x) => {
      x.guard = guardFor(x.market, x.pick);
      if (x.guard?.kind !== 'gap') r.unchecked.add(x.id);
      if (x.guard?.skip) skipped(x.market, x.id, x.guard, x.pick);
      return !x.guard?.skip;
    });
    // (the spread and the moneyline never on one side, this run's or against the game's open bets: oneSide; a
    // tracked row stakes nothing, so it holds no side against a new one)
    const ids = new Set(picks.map((x) => x.id));
    picks = oneSide(picks, r.ledger.bets.filter((b) => b.event === game.id && standing(r, b) && !ids.has(b.id) && !isTracked(b)));
    // (a market giving way to another new one this run: if the cap drops that one (placeBets), its rest is
    // lifted, so a later run can bet it)
    const gaveWay = picks.find((x) => x.drop || x.flipped);
    const tookIt = gaveWay && picks.find((x) => x !== gaveWay && ids.has(x.id) && (x.market === 'spread' || x.market === 'ml') && !x.drop);
    for (const { market: key, id, pick, drop, flipped, guard: was } of picks) {
      const market = { market: key };
      if (drop) {
        rest(r, id, drop);
        if (tookIt) (r.gaveWay ??= new Map()).set(tookIt.id, id);
        if (DRY) console.log(`${sport} (dry) not bet ${game.awayAbbr} @ ${game.homeAbbr} ${key}: ${drop}`);
        continue;
      }
      // (a flipped side's guards its own: the move counted against the new side)
      let guard = flipped ? guardFor(key, pick) : was;
      if (guard?.skip) {
        skipped(key, id, guard, pick);
        continue;
      }
      // (on ESPN's board with a key to hand: The Odds API's price never came; for the data only)
      const noPrice = hasKey() && !apiLines;
      if (noPrice) guard = { why: [guard?.why, "no Odds API price (ESPN's board)"].filter(Boolean).join('; ') };
      const units = guard ? 0.5 : pick.units;
      // (an edge bet at its stake, a flagged one (a guard's cut: questionable, weather, a moved line) at the
      // minimum, still a LIKE or better (the owner's: an edge is bet); with no edge, or off ESPN's board alone,
      // tracked, not bet: desk.mjs placement)
      const placed = placement(pick.ev > 0 && !noPrice, units);
      const bet = {
        id,
        event: game.id,
        sport,
        start: game.date,
        // (when it was placed: now, not the run's start; a run can take minutes)
        placedAt: new Date().toISOString(),
        matchup: `${game.awayAbbr} @ ${game.homeAbbr}`,
        market: market.market,
        side: pick.side,
        line: pick.line,
        odds: pick.odds,
        model: round(pick.model, 4),
        fair: round(pick.fair, 4),
        p: round(pick.p, 4),
        ev: round(pick.ev, 4),
        // (edge: it sees value, bet; track: no edge (or a guard cut it), not bet, units 0, graded and learned
        // from like a bet (the old action bet, 0.5u for the data: its stake kept, trackUnits))
        ...placed,
        // (the model's chance of a push, an integer line landing on the number: its EV counts it)
        ...(pick.push ? { push: round(pick.push, 4) } : {}),
        // (a moneyline's spread it was priced off: the trust fit prices it again the same way, backtest.mjs
        // repriced; none, the book's chance alone)
        ...(key === 'ml' ? (pick.spreadHome ? { spreadHome: pick.spreadHome } : { anchored: false }) : {}),
        expMargin: round(exp.margin, 2),
        expTotal: round(exp.total, 2),
        book: lines.book,
        fairFrom: fairFrom[market.market] ?? 'its own prices',
        // (the other books' consensus fair beside the book's, the data's: never priced off, oddsapi.mjs)
        ...consensusOn(lines, key, pick.side),
        context: { ...seen, ...(guard ? { guard: guard.why } : {}), ...(flipped ? { oneSide: `the other side of its ${key === 'ml' ? 'spread' : 'moneyline'}'s, which took this one` } : {}), ...(noted.length ? { ownerNotes: noted } : {}) },
        status: 'open',
        profit: 0,
        // (the inputs it was priced on, and the bet it replaces when priced again on news: repriceOpen)
        ...stampOf(r, id, game.id),
      };
      bet.pick = pickText(bet, game);
      r.pending.push({ bet, game });
      r.placed.add(id);
    }
  }
  if (held.size) console.log(`${sport}: game markets held for a later run: ${[...held].map(([why, n]) => `${n} (${why})`).join(', ')}`);
}

// (an open bet that stands against a game's new ones: a dry run prices again every open bet on a game not
// started, as a --replace run does, so only the ones on games under way, and the published ones (locked: a
// live run keeps them), count there)
const standing = (r, b) => b.status === 'open' && !(DRY && !b.published && Date.parse(b.start) > r.now.getTime());

// 6b. this run's new bets placed (r.pending: the game markets' and the props'), each game's under GAME_CAP: the
// units already open on it and the new ones' together; over it the new ones scaled down alike, the least worth
// having dropped (desk.mjs capGame; a game market dropped rests, as a skipped one does). Before that, an
// earlier run's action bets on the game (no edge, not locked, from before they were tracked) taken back as far as this run's edge bets need
// the room (desk.mjs makeRoom: the cap would otherwise go to whichever came first). First of all, the game's edge
// props sized jointly (desk.mjs sizeJointly, at the same-game correlations sameGameOf uses: r.sameGame), with its
// other props this run's and the ones standing on it as placed (a tracked row, staking nothing, not among them;
// the three steps desk.mjs placeGame). The rests kept
function placeBets(r) {
  const { sport } = r;
  const pending = r.pending ?? [];
  const ids = new Set(pending.map((x) => x.bet.id));
  const byGame = new Map();
  for (const x of pending) byGame.set(x.bet.event, [...(byGame.get(x.bet.event) ?? []), x.bet]);
  // (the same-game correlations, a player's own props' and the rest of a game's: fit on the graded props, each
  // used only where held-out days bore it out, and none where the replay's bankroll floor turned them off)
  const sg = (r.sameGame = sameGameOf(r.ledger.bets));
  const kindText = (k, name) => `${name} ${sg.used[k]} (fit ${sg[k].rho}, raw ${sg[k].raw ?? '-'} se ${sg[k].se ?? '-'}, ${sg[k].pairs} pairs in ${sg[k].games} games${sg[k].fitted ? '' : ', under the games it needs'}; held out ${sg[k].held.games} games, gain ${sg[k].held.gain})`;
  const replayText = (x) => `${x.resized} stakes resized ${x.trimmed}u, log growth ${x.asBet} as bet, ${x.joint} jointly`;
  console.log(`${sport}: same-game sizing: rho ${sameGameRhoText(sg.used)}; ${kindText('player', "a player's own")}; ${kindText('game', "the game's")}; replay (x1000) as of each day ${replayText(sg.replay.asOf)}, at the rhos used ${replayText(sg.replay.inSample)}${sg.floor ? ': grew the bankroll less, left out' : ''}`);
  let sized = 0;
  let capped = 0;
  let dropped = 0;
  let madeRoom = 0;
  const run = r.propRun;
  for (const [event, mine] of byGame) {
    const standingNow = r.ledger.bets.filter((b) => b.event === event && standing(r, b) && !ids.has(b.id));
    const plan = placeGame(mine, standingNow, sg.used, GAME_CAP, (b) => !b.published && Date.parse(b.start) - Date.now() > REPRICE_BY);
    const { out, open } = plan;
    sized += plan.sized;
    capped += plan.capped;
    if (out.length) {
      const gone = new Set(out);
      madeRoom += out.length;
      if (DRY) for (const b of out) console.log(`${sport} (dry) taken back for room: ${b.matchup} ${b.pick} ${b.units}u (action)`);
      if (!DRY) {
        r.ledger.bets = r.ledger.bets.filter((b) => !gone.has(b));
        for (const b of out) {
          r.placed.delete(b.id);
          if (b.market !== 'prop') rest(r, b.id, 'taken back for an edge bet on its game');
        }
      }
    }
    for (const b of plan.dropped) {
      dropped++;
      r.placed.delete(b.id);
      if (b.market !== 'prop') rest(r, b.id, `the game's ${GAME_CAP}u cap`);
      // (the market that gave way to this one (betGames, oneSide) free again for a later run)
      const freed = r.gaveWay?.get(b.id);
      if (freed) delete r.rest[freed];
      if (DRY) console.log(`${sport} (dry) not bet ${b.matchup} ${b.pick}: the game's ${GAME_CAP}u cap (${open}u open on it)`);
    }
    for (const b of plan.kept) {
      if (DRY) console.log(`${sport} (dry) ${isTracked(b) ? 'tracked ' : ''}${b.market === 'prop' ? 'prop ' : ''}${b.matchup} ${b.pick} ${isTracked(b) ? `0u (${b.trackUnits}u as an action bet)` : `${b.units}u ${levelOf(b, kellyOf(b.odds, b.p), b.p)}`} p ${b.p} ev ${b.ev}${b.market === 'prop' ? `: ${JSON.stringify(b.projection)}` : ''}${b.context?.guard ? ` [${b.context.guard}]` : ''}${b.context?.sameGame ? ` [${b.context.sameGame}]` : ''}${b.context?.cap ? ` [${b.context.cap}]` : ''}${b.context?.oneSide ? ' [flipped: one side]' : ''}`);
      r.ledger.bets.push(b);
      r.newBets++;
      if (isTracked(b)) {
        r.newTracked = (r.newTracked ?? 0) + 1;
        if (b.market === 'prop' && run) run.tracked = (run.tracked ?? 0) + 1;
        continue;
      }
      if (b.market === 'prop' && run) {
        run.bet++;
        run.units += b.units;
        if (b.side === 'under') run.betUnder = (run.betUnder ?? 0) + 1;
      }
    }
  }
  if (sized) console.log(`${sport}: same-game sizing: ${sized} edge props' stakes cut with their games' other props`);
  if (capped || dropped || madeRoom) console.log(`${sport}: the games' ${GAME_CAP}u cap: ${capped} bets cut, ${dropped} not bet, ${madeRoom} open action bets taken back for edge bets' room`);
  r.madeRoom = madeRoom;
  if (run?.priced) console.log(`${sport}: props bet ${run.bet} for ${run.units}u (${run.bet - (run.betUnder ?? 0)} over, ${run.betUnder ?? 0} under), ${run.tracked ?? 0} tracked (no edge: not bet)`);
  if (r.newTracked) console.log(`${sport}: ${r.newBets - r.newTracked} new bets placed (edge: LIKE or better), ${r.newTracked} markets tracked, not bet (no edge, or a guard cut them)`);
  saveRest(r);
}

// (why a coming game can't be bet this run, or null: its context wasn't gathered (context.mjs threw), or its
// injury report couldn't be read; either way it would be bet as if everyone were healthy; or, the NFL's, its
// nflverse row (its starting quarterbacks, and the history the props' fill-in terms read) isn't there: nflverse
// unread, or the game not in it yet; it would be bet as if both teams started their usual quarterback)
function blindOf(r, game) {
  const l = r.live?.get(game.id);
  if (!l || !r.feats) return 'its context not gathered';
  if (l.injuriesFailed) return 'the injury report not read';
  if (r.sport === 'nfl' && (r.times?.nflverse?.ok === false || !l.row)) return "nflverse's row for it not read: its quarterbacks unseen";
  return null;
}

// 6. the props of the coming games inside their window (leagues.mjs TIMING; before it, nothing asked or
// priced): each main line projected and priced; the ones with an edge bet, the day's best first, under the caps
// (props.mjs; leagues.mjs PROP_CAPS), each once the news it waits for is in or at the last chance, flagged
async function betProps(r) {
  const { sport, cfg, state, trust, ledger, at } = r;
  const run = { games: 0, priced: 0, under: 0, even: 0, evenUnder: 0, bet: 0, units: 0 };
  r.propRun = run;
  // (the open CHECKs evaluated again this run: id -> 'note' or 'reprice', recordChecks' resolved)
  r.reEval = new Map();
  // (the open CHECKs with an owner's note unanswered this run couldn't re-price: id -> why, recordChecks'
  // resolved still with it (held), so the page doesn't keep promising a re-price)
  r.noteHeld = new Map();
  const holdNoted = (checks, why) => {
    for (const c of checks) if (!r.reEval.has(c.id) && !r.noteHeld.has(c.id) && noteOpen(c, r.notes?.get(c.id))) r.noteHeld.set(c.id, why);
  };
  const openChecksOf = (game) => (ledger.checks ?? []).filter((c) => c.market === 'prop' && String(c.event) === String(game.id) && openCheck(c, r.now));
  if (!r.props || !Object.keys(r.props).length) return;
  const statOf = (key) => STATS[sport]?.find((s) => s.key === key) ?? null;
  const STORED_HOURS = STORED_FRESH / 36e5;
  const idx = rowsIndex(sport, r.rows);
  const candidates = [];
  // (the caps: a prop type not yet tested (its trust unfit) stakes little; the day is the game's US Eastern date,
  // daylight saving and all)
  const dayOf = etDay;
  const capsOf = (key) => (trust[`prop:${key}`]?.fitted ? PROP_CAPS.tested : PROP_CAPS.untested);
  const untestedUnits = (day) => ledger.bets.filter((b) => b.market === 'prop' && !b.tested && dayOf(b.start) === day).reduce((t, b) => t + b.units, 0);
  if (JSON.stringify(state.propCaps ?? null) !== JSON.stringify(PROP_CAPS)) {
    state.changelog.push({ at, what: 'Prop caps', from: state.propCaps ? 'before' : 'none', to: `${PROP_CAPS.untested.maxUnits}u a prop untested, ${PROP_CAPS.tested.maxUnits}u tested, ${PROP_CAPS.untested.perGame ?? 'every'} a game, ${PROP_CAPS.untested.perPlayer ?? 'every'} a player, ${GAME_CAP}u a game with its markets`, why: "Every main-line prop with a real price is priced, bet with an edge (tracked, not bet, without one), as the game markets are, but one a player a game (his props rise and fall together) and a game's stake, markets and props, at most the game's cap; an untested type stakes at most 1 unit" });
    state.propCaps = PROP_CAPS;
  }
  // (The Odds API's props for a game, the desk's book's: asked once to bet (once its props are due: inside
  // their window, leagues.mjs TIMING), once near the start (within 2.5 hours, if it has prop bets open or owed:
  // their last line and price before the close, the NFL's CLV), and again when its props were taken back (on
  // news, or by --replace) and its board has no prices of its own (the NFL's: owed, kept till an ask succeeds,
  // so one whose ask failed or waited on the allowance isn't left with nothing to bet on); timing.mjs propAsk.
  // PROP_ASKS at most; the counts kept in .cache/model/odds-props.json, with the markets the book returned on each
  // game's last ask (:dk, the only ones the other books are asked for on the next: oddsapi.mjs propAsks). The
  // games never asked go first, so the re-asks don't spend the allowance their first asks need)
  const asked = read(PROPS_ASKED, {});
  if (!DRY) {
    const owe = new Set([...(r.replacedProps ?? []), ...[...(r.takenBack?.values() ?? [])].filter((x) => x.bet.market === 'prop').map((x) => x.bet.event)]);
    // (a game with an owner's note on a prop CHECK not seen before: its props asked for again, priced on it;
    // a note on a bet or a game market's CHECK owes none, so the notes on every pick cost no more asks)
    for (const [id, noteAt] of r.propNoteAt ?? []) {
      if (asked[`${id}:note`] === noteAt) continue;
      asked[`${id}:note`] = noteAt;
      owe.add(id);
    }
    for (const id of owe) asked[`${id}:owed`] = 1;
    if (owe.size) write(PROPS_ASKED, asked);
  }
  // (the NFL's, NBA's and NHL's rosters now, each team's once a run: a teammate no longer on it (traded,
  // released) counts as missing in the work his group leaves, as the history counts him (props.mjs
  // priceProps); one not read, null)
  const rosters = new Map();
  const rosterOf = async (team) => {
    if (!rosters.has(String(team))) rosters.set(String(team), await roster(cfg.league, team, ROSTER_MIN[sport] ?? 40).catch(() => null));
    return rosters.get(String(team));
  };
  const firstAsks = [...r.upcoming].sort((a, b) => Number((asked[a.game.id] ?? 0) > 0) - Number((asked[b.game.id] ?? 0) > 0));
  for (const u of firstAsks) {
    const game = u.game;
    try {
      // (not this run: a game whose context or injury report couldn't be read (blindOf), or, with The Odds API to
      // hand, one it doesn't list (outside its range or not matched): its props wait for a run that can see it)
      // (and not before its window: leagues.mjs TIMING; nothing asked or priced for it yet)
      const until = Date.parse(game.date) - r.now.getTime();
      const phase = phaseOf(sport, 'props', until, r.gap);
      const hold = (phase === 'early' ? 'not in their window yet' : null) ?? blindOf(r, game) ?? (hasKey() && !u.lines.oddsEvent ? 'not on The Odds API' : null);
      if (hold) {
        run.held = { ...(run.held ?? {}), [hold]: (run.held?.[hold] ?? 0) + 1 };
        holdNoted(openChecksOf(game), `its game's props held this run (${hold})`);
        continue;
      }
      let board_ = await board(sport, cfg.league, game);
      // (the line log: every prop on the board as ESPN shows it, and The Odds API's where it's asked below)
      (r.lineRows ??= []).push(...propRows(game.id, board_));
      // (its open prop CHECKs (checks.mjs openCheck): priced from their stored prices where nothing fresher
      // comes, so a game whose board shows none still has them)
      const openChecks = openChecksOf(game);
      // (why a noted one wasn't re-priced, where the run can tell: holdNoted once the game's done)
      const heldWhy = new Map();
      if (!board_.length && !openChecks.length) continue;
      const times = asked[game.id] ?? 0;
      const open = ledger.bets.filter((b) => b.event === game.id && b.market === 'prop' && b.status === 'open');
      // (an owner's note not yet answered on a CHECK whose line has moved on the board: its stored price is no
      // longer the board's, so its game's props are owed an ask, once a note, to price it on the note's run)
      const movedNoted = withStoredPrices(board_, openChecks, game, r.now, statOf).moved;
      const noteAt = Math.max(0, ...openChecks.filter((c) => movedNoted.has(c.id) && noteOpen(c, r.notes?.get(c.id))).map((c) => Date.parse(r.notes.get(c.id).at ?? '') || 1));
      if (noteAt && !DRY && asked[`${game.id}:note-moved`] !== noteAt) {
        asked[`${game.id}:note-moved`] = noteAt;
        asked[`${game.id}:owed`] = 1;
        write(PROPS_ASKED, asked);
      }
      // (asked once its props are due, once more near the start for the open ones' last line (the NFL's
      // close), and again when its props were taken back and its board has no prices (owed), at most
      // PROP_ASKS times a game: timing.mjs propAsk)
      const owed = !!asked[`${game.id}:owed`];
      const boardPriced = board_.some((p) => p.prices);
      const why = propAsk({ times, max: PROP_ASKS, owed, boardPriced, nearAsked: !!asked[`${game.id}:near`], until, open: open.length });
      if (owed && times >= PROP_ASKS && !boardPriced) run.owedOut = (run.owedOut ?? 0) + 1;
      let fresh = false;
      if (why && u.lines.oddsEvent && !DRY) {
        // (the other books asked only for the markets the book returned on this game's last ask (:dk), so they
        // add none: props.mjs apiProps, oddsapi.mjs propAsks; their consensus the data's, never priced off)
        const api = await apiProps(sport, u.lines.oddsEvent, { known: asked[`${game.id}:dk`] ?? null });
        if (api) {
          fresh = true;
          asked[game.id] = times + 1;
          asked[`${game.id}:dk`] = api.dkMarkets ?? [];
          if (why === 'near') asked[`${game.id}:near`] = 1;
          delete asked[`${game.id}:owed`];
          write(PROPS_ASKED, asked);
          consensusSeen(r, 'props', [...api.values()].map((x) => x.consensus).filter(Boolean), api.size);
          board_ = withApiPrices(board_, api);
          r.lineRows.push(...propRows(game.id, board_).filter((x) => x.src === 'o'));
          run.api = (run.api ?? 0) + 1;
          // (each open prop's line and price as the stand-in for its close: captureClose takes it within 3
          // hours of the start)
          for (const b of open) {
            const p = board_.find((x) => String(x.athlete.id) === String(b.athlete) && x.stat.key === b.propType && x.prices);
            if (p) b.seen = { at: r.at, line: p.line, odds: b.side === 'over' ? p.prices.over : p.prices.under, fair: b.side === 'over' ? fairPair(p.prices.over, p.prices.under) : fairPair(p.prices.under, p.prices.over) };
          }
        }
      }
      // (no fresh price from The Odds API this run: its open CHECKs priced from their stored prices, where the
      // line is still the board's (checks.mjs withStoredPrices), so each is evaluated again: still a CHECK,
      // closed, or bet. The Odds API asked, the props it didn't price stay unpriced: the book took them down)
      if (!fresh && openChecks.length) {
        const sp = withStoredPrices(board_, openChecks, game, r.now, statOf);
        board_ = sp.board;
        for (const id of sp.moved) heldWhy.set(id, 'its line moved on the board, no fresh price for the new one yet');
        run.stored = (run.stored ?? 0) + sp.used.size;
        run.storedMoved = (run.storedMoved ?? 0) + sp.moved.size;
      }
      if (!board_.length) {
        holdNoted(openChecks, "not on the board, and no price of the book's kept");
        continue;
      }
      run.games++;
      const { exp: exp0, f } = expectFor(r, game);
      // (the book's lines now as implied points (props.mjs marketPts): the props' market game flow, where kept;
      // and the home side's margin by the spread alone (marketSpread: the lines' spread term, mSpread, with or
      // without the total; none, and a prop that weighs it is a CHECK: props.mjs spreadBlind))
      const homeMargin = Number.isFinite(u.lines?.spread?.home?.line) ? -u.lines.spread.home.line : null;
      // (and the total alone (marketTotal: the NHL skaters' market total, props.mjs CTX mTotal; none, the term reads 0))
      const exp = { ...exp0, market: marketPts(u.lines?.total?.line, homeMargin), marketSpread: homeMargin, marketTotal: Number.isFinite(u.lines?.total?.line) ? u.lines.total.line : null };
      const live0 = ROSTER_MIN[sport] ? { ...(r.live.get(game.id) ?? {}), rosters: new Map([[String(game.home), await rosterOf(game.home)], [String(game.away), await rosterOf(game.away)]]) } : r.live.get(game.id);
      // (the NFL's depth charts now, the site's (props.mjs readDepth: the role guard's depth CHECK), read once a run)
      const live = sport === 'nfl' ? { ...(live0 ?? {}), depth: (r.depth ??= readDepth(path.join(ROOT, 'apps/nfl/src/StaticData/depth'))) } : live0;
      // (the NFL's questionable players at their play chance once the final injury report's out, before it at
      // half: playchance.mjs playAt)
      const { priced, bets } = priceProps(sport, game, board_, r.props, idx, exp, f?.info ?? null, live, trust, EV_SCALE, playAt(r.playChance ?? null, game.date, r.now.getTime()), r.players ?? null);
      run.priced += priced.length;
      // (the betting board's props: the ones at the book's own price (a CHECK's stored one while it'd still be
      // bet: storedBet), the game's whole board when it was asked fresh, else over the last board's: writeBoard)
      const onBoard = priced.filter((x) => x.priced && !storedBet(x.prop.stored, hasKey(), r.now));
      (r.boardProps ??= new Map()).set(game.id, { rows: onBoard.map((x) => boardProp(x, x.prop.stored?.at ?? at)), whole: fresh || board_.some((p) => p.prices && !p.stored), lines: new Map(board_.filter((p) => !p.stored?.offBoard).map((p) => [`${p.stat.key}:${p.athlete.id}`, p.line])) });
      // (the skips by kind: the market-gap guard's counted on its own)
      for (const x of priced) if (x.guard?.skip) run.skipped = { ...(run.skipped ?? {}), [x.guard.kind ?? 'other']: (run.skipped?.[x.guard.kind ?? 'other'] ?? 0) + 1 };
      run.under += priced.filter((x) => x.side === 'under').length;
      // (the ones at an even line: the ones it could bet)
      const even = priced.filter((x) => !x.guard?.skip);
      run.even += even.length;
      run.evenUnder += even.filter((x) => x.side === 'under').length;
      // (with The Odds API to hand, a prop waits for its real price (asked once its props are due) rather than
      // going at the assumed -110: that's only the fallback when the API can't be had)
      // (and none on a game starting within five minutes by the clock now)
      // (each waits for the news it lacks (timing.mjs newsMissing: an MLB batter's lineup, the starters, the
      // NHL's goalies) till the last chance, then goes with what's known, flagged at the minimum)
      if (Date.parse(game.date) - Date.now() >= 5 * 60e3) {
        for (const x of bets) {
          if (!x.priced && hasKey()) continue;
          // (priced from its CHECK's stored price (withStoredPrices): with The Odds API to hand, a real price only
          // while STORED_FRESH old; an older one's CHECK is only closed, the bet left to the next ask)
          // (and one off a board still showing his market (pulled: the book took it down) never: storedBet)
          const notBet = storedBet(x.prop.stored, hasKey(), r.now);
          if (notBet) {
            if (notBet === 'pulled') run.storedPulled = (run.storedPulled ?? 0) + 1;
            else run.storedStale = (run.storedStale ?? 0) + 1;
            continue;
          }
          const news = newsMissing(sport, r.live.get(game.id), { kind: 'props', home: String(x.prop.athlete.team) === String(game.home), pitcher: !!x.prop.stat.pitcher });
          if (news.length && phase !== 'last') {
            run.waiting = (run.waiting ?? 0) + 1;
            continue;
          }
          if (news.length) Object.assign(x, { guard: { why: [x.guard?.why, `bet at the last chance before the news: ${news.join(', ')}`].filter(Boolean).join('; ') }, units: 0.5 });
          candidates.push({ game, x, exp });
        }
        // (one skipped for the model's distance from the book alone, or for his role changing (an NFL prop's:
        // props.mjs roleChangeOf, either side): kept as a CHECK on the model's side (checks.mjs), on the same
        // terms a bet would wait for: a real price, the news it waits for. An open bet taken back to price again
        // (repriceOpen) whose player's role is changing now is one of these: a CHECK, not bet again)
        // (one priced on those terms neither guard skipped: its CHECK closed, checks.mjs closeChecks)
        for (const x of priced) {
          const id = `${game.id}:prop:${x.prop.stat.key}:${x.prop.athlete.id}`;
          if (!x.priced && hasKey()) {
            if (!heldWhy.has(id)) heldWhy.set(id, fresh ? 'the book has no price for it now' : "no price of the book's kept, and its props not asked again this run");
            continue;
          }
          if (newsMissing(sport, r.live.get(game.id), { kind: 'props', home: String(x.prop.athlete.team) === String(game.home), pitcher: !!x.prop.stat.pitcher }).length && phase !== 'last') {
            heldWhy.set(id, 'waiting on the news (a lineup, a starter, a goalie)');
            continue;
          }
          // (an open CHECK evaluated again: from its stored price, or on an owner's note not yet answered; how it
          // comes out kept on it, recordChecks)
          const was = openChecks.find((c) => c.id === id);
          const noted = !!was && noteOpen(was, r.notes?.get(id));
          if (was && (x.prop.stored || noted)) r.reEval?.set(id, noted ? 'note' : 'reprice');
          if (!CHECK_KINDS.has(x.guard?.kind)) {
            r.unchecked?.add(id);
            continue;
          }
          if (r.placed.has(id) && !DRY) continue;
          r.checks?.push(checkOf(propBet(r, game, x, exp, { id, intent: 'check', units: 0, tested: !!trust[`prop:${x.prop.stat.key}`]?.fitted }), x.guard));
        }
      }
      // (a noted open CHECK this game's run didn't re-price: why, kept on it (resolveChecks' held))
      for (const c of openChecks) if (!heldWhy.has(c.id)) heldWhy.set(c.id, Date.parse(game.date) - Date.now() < 5 * 60e3 ? 'its game about to start' : "not on the board, and no price of the book's kept");
      for (const c of openChecks) holdNoted([c], heldWhy.get(c.id));
      // (the dry snapshot's: each prop's mean, line and chance over, the work missing and its factor, the guard's kind
      // and role, its side)
      for (const x of priced) r.snapshot.projections[`${game.id}:${x.prop.stat.key}:${x.prop.athlete.id}`] = [x.projection.mean, x.prop.line, x.projection.pOver, x.projection.vac, x.projection.vacF, x.guard?.kind ?? null, x.guard?.role ?? null, x.side];
      // (the projections' lean: how many the model takes under (its chance over the line under half) against
      // how many it projects under the line (the mean under it): the spread's skew and the calibration's)
      for (const x of priced) {
        run.pUnder = (run.pUnder ?? 0) + (x.projection.pOver < 0.5 ? 1 : 0);
        run.muUnder = (run.muUnder ?? 0) + (x.projection.mean < x.prop.line ? 1 : 0);
        if (!CHECK_KINDS.has(x.guard?.kind)) continue;
        // (a shadow's (checks.mjs shadowOf, as recordChecks keeps it) by its passAs)
        const sh = shadowOf({ cause: causeOf(x.guard), odds: x.odds, model: x.model, fair: x.fair, oddsAssumed: !x.priced });
        const k = `${x.guard.kind === 'role' ? `role:${x.guard.role}` : x.guard.kind === 'news' ? `news:${x.guard.news}` : x.guard.kind}:${x.side}${sh ? `:pass-${sh.passAs}` : ''}`;
        run.checkSides = { ...(run.checkSides ?? {}), [k]: (run.checkSides?.[k] ?? 0) + 1 };
      }
    } catch (err) {
      console.warn(`${sport}: props for ${game.id} skipped (${err.message})`);
    }
  }
  const pendingProps = (event) => (r.pending ?? []).map((p) => p.bet).filter((b) => b.event === event && b.market === 'prop');
  for (const { game, x, exp } of candidates.sort((a, b) => b.x.ev - a.x.ev)) {
    const id = `${game.id}:prop:${x.prop.stat.key}:${x.prop.athlete.id}`;
    // (the game's props: placed before (a dry run prices those again, so only the published ones, which a live
    // run keeps, and this run's count) and this run's. An edge bet counts only the bets against its caps (a
    // tracked row stakes nothing: no exposure); a tracked one counts every row, as the action bets did)
    // (a flagged one (a guard's cut) with an edge: bet at the minimum, as the game markets; the owner's)
    const edge = x.ev > 0;
    if (x.guard) x.units = 0.5;
    const mine = [...ledger.bets.filter((b) => b.event === game.id && b.market === 'prop' && !b.void && b.id !== id && (!DRY || b.published)), ...pendingProps(game.id)].filter((b) => !edge || !isTracked(b));
    if (r.placed.has(id) && !DRY) continue;
    const caps = capsOf(x.prop.stat.key);
    const tested = caps === PROP_CAPS.tested;
    const inGame = mine.filter((b) => (tested ? true : !b.tested)).length;
    if ((caps.perGame !== null && inGame >= caps.perGame) || (PER_GAME !== null && mine.length >= PER_GAME)) continue;
    // (one a player a game, his best return (the candidates come best first): his props rise and fall together)
    if (caps.perPlayer !== null && caps.perPlayer !== undefined && mine.filter((b) => String(b.athlete) === String(x.prop.athlete.id)).length >= caps.perPlayer) continue;
    x.units = Math.min(x.units, caps.maxUnits);
    if (!tested && caps.perDay !== null && untestedUnits(dayOf(game.date)) + pendingProps(game.id).filter((b) => !b.tested).reduce((t, b) => t + b.units, 0) + x.units > caps.perDay) continue;
    const bet = propBet(r, game, x, exp, { id, ...placement(edge, x.units), tested });
    // (placed with the game markets, under the game's cap: placeBets)
    r.pending.push({ bet, game });
    r.placed.add(id);
  }
  if (run.owedOut) console.log(`${sport}: props taken back in ${run.owedOut} games not bet again (The Odds API asked ${PROP_ASKS} times for them already, and their board has no prices)`);
  if (run.waiting) console.log(`${sport}: props waiting for the news (a lineup, a starter, a goalie): ${run.waiting}`);
  if (run.stored || run.storedMoved) console.log(`${sport}: open CHECKs priced from their stored prices: ${run.stored ?? 0}${run.storedMoved ? `; ${run.storedMoved} not (the line moved on the board)` : ''}${run.storedStale ? `; ${run.storedStale} not bet (the price over ${STORED_HOURS} hours old: closed only)` : ''}${run.storedPulled ? `; ${run.storedPulled} not bet (off a board still showing his market: pulled)` : ''}`);
  if (run.held) console.log(`${sport}: props held for a later run: ${Object.entries(run.held).map(([why, n]) => `${n} games (${why})`).join(', ')}`);
  if (run.skipped) console.log(`${sport}: props skipped: ${Object.entries(run.skipped).map(([k, n]) => `${n} ${{ gap: 'past the market gap (PASSes, kept as shadows)', role: `role changes (CHECKs at a model Kelly of +${Math.round(CHECK_KELLY * 100)} or more, else shadows)`, news: 'the news on his unit (CHECKs)', unpriced: 'unpriced (no price, a line -110 can\'t be)', skew: 'the side against its own projection (the skew alone)' }[k] ?? 'by the other guards'}`).join(', ')}`);
  if (run.checkSides) console.log(`${sport}: props' CHECKs by cause and side: ${Object.entries(run.checkSides).sort().map(([k, n]) => `${k} ${n}`).join(', ')}`);
  if (run.priced) console.log(`${sport}: props' lean: the model under the line's even chance on ${run.pUnder ?? 0} of ${run.priced} (${Math.round((100 * (run.pUnder ?? 0)) / run.priced)}%), its projection under the line on ${run.muUnder ?? 0} (${Math.round((100 * (run.muUnder ?? 0)) / run.priced)}%)`);
  if (run.priced) console.log(`${sport}: props priced ${run.priced} in ${run.games} games (${Math.round((100 * run.under) / run.priced)}% under; at even lines ${run.even}, ${Math.round((100 * run.evenUnder) / Math.max(1, run.even))}% under), ${(r.pending ?? []).filter((p) => p.bet.market === 'prop').length} to place`);
  consensusLog(r, 'props');
}

// A priced prop (props.mjs priceProps) as the ledger's bet (or, intent 'check', the CHECK's: checks.mjs): its
// player and his team, its side, line and price and the other side's, its chances, its projection, the context
// it saw (an owner's note on the game among it), and the inputs it was priced on
function propBet(r, game, x, exp, { id, intent, units, trackUnits, tested }) {
  const { sport } = r;
  const noted = noteWords(r.live?.get(game.id));
  const bet = {
    id,
    event: game.id,
    sport,
    start: game.date,
    placedAt: new Date().toISOString(),
    matchup: `${game.awayAbbr} @ ${game.homeAbbr}`,
    market: 'prop',
    propType: x.prop.stat.key,
    statLabel: x.prop.stat.label,
    player: x.prop.athlete.name,
    athlete: x.prop.athlete.id,
    // (MLB: his StatsAPI id too, which grades his total bases by id rather than by name)
    ...(sport === 'mlb' && String(x.pid).startsWith('mlb:') ? { mlbId: String(x.pid).slice(4) } : {}),
    // (his team, ESPN's id: the desk colors the bet by it)
    team: x.prop.athlete.team ?? null,
    side: x.side,
    line: x.prop.line,
    odds: x.odds,
    // (the other side's price, the book's: the page shows both sides; none at an assumed -110)
    ...(Number.isFinite(x.otherOdds) ? { otherOdds: x.otherOdds } : {}),
    oddsAssumed: !x.priced,
    model: round(x.model, 4),
    fair: round(x.fair, 4),
    p: round(x.p, 4),
    ev: round(x.ev, 4),
    intent,
    units,
    // (a tracked one's: what it would have staked, desk.mjs placement)
    ...(Number.isFinite(trackUnits) ? { trackUnits } : {}),
    expMargin: round(exp.margin, 2),
    expTotal: round(exp.total, 2),
    book: 'DraftKings',
    pricesFrom: x.prop.source ?? (x.priced ? 'espn' : 'assumed -110'),
    // (the other books' consensus at its line, its side's, the data's: never priced off, oddsapi.mjs)
    ...consensusFields(x.prop.consensus, x.side, 'over'),
    // (when its price was The Odds API's: this run's ask, or (priced from its CHECK's stored price:
    // checks.mjs withStoredPrices) the ask that gave it; a CHECK keeps it, so a later run knows how old it is)
    ...(x.prop.stored ? { priceAt: x.prop.stored.at } : intent === 'check' && x.prop.source === 'the odds api' ? { priceAt: new Date().toISOString() } : {}),
    projection: x.projection,
    tested,
    context: { move: x.move, ...(x.guard && intent !== 'check' ? { guard: x.guard.why } : {}), ...(noted.length ? { ownerNotes: noted } : {}) },
    status: 'open',
    profit: 0,
    // (the inputs it was priced on, and the bet it replaces when priced again on news: repriceOpen)
    ...(intent === 'check' ? {} : stampOf(r, id, game.id)),
  };
  bet.pick = `${bet.player} ${bet.side === 'over' ? 'Over' : 'Under'} ${bet.line} ${bet.statLabel}`;
  return bet;
}

// 6c. this run's CHECKs (betGames' and betProps': checks.mjs) on the ledger's list (ledger.checks, apart from
// its bets): a new one added, one there written again while it isn't locked and something material changed;
// one whose market was bet after all noted with the bet; one whose market was priced this run without the gap
// guard skipping it closed (closeChecks); and each one's owner's note kept on it (notes.mjs),
// its outcome the CHECK's own result (gradeChecks)
function recordChecks(r) {
  const { sport } = r;
  // (checks.json unreadable: nothing recorded on a list that won't be written, so nothing is half-kept)
  if (r.checksUnreadable) {
    if (r.checks?.length) console.warn(`${sport}: ${r.checks.length} CHECKs this run not recorded (checks.json unreadable)`);
    return;
  }
  let added = 0;
  let updated = 0;
  let passed = 0;
  // (the ones bet and closed before this run's recording: the rest, bet or closed by it, resolved so)
  const before = { bet: new Set((r.ledger.checks ?? []).filter((c) => c.bet).map((c) => c.id)), closed: new Set((r.ledger.checks ?? []).filter((c) => c.closedAt).map((c) => c.id)) };
  for (const c of r.checks ?? []) {
    const res = upsertCheck(r.ledger, c, r.now);
    if (res === 'new') added++;
    else if (res === 'updated') updated++;
    else if (res === 'passed') passed++;
    if (DRY && res) console.log(`${sport} (dry) ${res === 'passed' ? 'CHECK passed (now a shadow)' : c.hidden ? `shadow (${c.passAs})` : 'CHECK'}${c.cause === 'role' ? ` (role: ${c.roleReason})` : c.cause === 'news' ? ` (news: ${c.newsUnit})` : ''} ${c.matchup} ${c.pick} ${c.odds}: model ${c.model} vs ${c.fair} (${c.reason})${c.cause === 'role' && c.projection ? ` [mean ${c.projection.mean}, vac ${c.projection.vac}, vacF ${c.projection.vacF}${c.projection.out ? `, out: ${c.projection.out.join(', ')}` : ''}]` : ''}`);
  }
  // (this run's CHECKs by what drives them: check-learn.mjs diagnose, made with each)
  const diag = {};
  for (const c of r.checks ?? []) {
    const k = c.diagnosis ? `${c.diagnosis.cause}${c.diagnosis.sub ? `:${c.diagnosis.sub}` : ''}` : 'none';
    diag[k] = (diag[k] ?? 0) + 1;
  }
  if (r.checks?.length) console.log(`${sport}: this run's CHECKs by diagnosis: ${Object.entries(diag).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const became = markPlaced(r.ledger);
  const ids = new Set((r.checks ?? []).map((c) => c.id));
  const closed = closeChecks(r.ledger, new Set([...(r.unchecked ?? [])].filter((id) => !ids.has(id))), r.now);
  // (the open CHECKs evaluated again this run, from their stored prices or on an owner's note (betProps): how
  // each came out kept on it, checks.mjs resolveChecks)
  const resolved = resolveChecks(r.ledger, r.reEval, before, r.now, r.noteHeld);
  if (resolved.held) console.log(`${sport}: ${resolved.held} noted CHECKs not re-priced this run (answered still, with why)`);
  if (DRY) for (const { check: c, held } of resolved.items.filter((i) => i.held)) console.log(`${sport} (dry) noted CHECK not re-priced: ${c.matchup} ${c.pick}: ${held}`);
  if (r.reEval?.size) {
    const by = [...r.reEval.values()].filter((v) => v === 'note').length;
    console.log(`${sport}: open CHECKs evaluated again (${r.reEval.size - by} from their stored prices, ${by} on an owner's note): ${resolved.bet} bet, ${resolved.closed} closed, ${resolved.still} still CHECKs`);
    if (DRY) for (const { check: c, as, by: why } of resolved.items.filter((i) => !i.held)) console.log(`${sport} (dry) CHECK evaluated again (${why}, priced ${c.priceAt ?? c.placedAt}): ${c.matchup} ${c.pick} ${c.odds}: ${as}${as === 'still' ? ` (model ${c.model} vs ${c.fair}: ${c.reason})` : as === 'bet' ? ` (${c.bet.units}u ${c.bet.intent})` : ''}`);
  }
  // (the day's news research on them (research.mjs), and whether a finding was put into the injury report)
  let researched = 0;
  for (const c of r.ledger.checks ?? []) {
    const found = r.researchFound?.get(c.id);
    if (found && !c.research) {
      c.research = found;
      researched++;
    }
    if (c.research && r.researchApplied?.has(c.id) && !c.research.applied) c.research = { ...c.research, applied: true };
  }
  if (researched) console.log(`${sport}: ${researched} CHECKs researched (their findings kept on them)`);
  let noted = 0;
  for (const c of r.ledger.checks ?? []) {
    const n = r.notes?.get(c.id);
    if (!n) continue;
    const kept = keptNote(n, c.note?.applied || r.notesApplied?.has(c.id));
    if (JSON.stringify(kept) === JSON.stringify(c.note)) continue;
    c.note = kept;
    noted++;
  }
  if (added || updated || passed || became || closed || noted) console.log(`${sport}: CHECKs and shadows (a guard's skip kept to learn from; checks.mjs shadowOf): ${added} new (this run's: ${(r.checks ?? []).filter((c) => !c.hidden).length} shown, ${(r.checks ?? []).filter((c) => c.hidden).length} shadows), ${updated} written again${passed ? `, ${passed} passed (shown, now shadows: their price frozen)` : ''}${became ? `, ${became} bet after all` : ''}${closed ? `, ${closed} closed (the gap gone)` : ''}${noted ? `, ${noted} owner's notes kept` : ''}`);
}

// (the graded CHECKs' learning, check-learn.mjs: by cause, and its ranked recommendations logged; a failure
// leaves none, never the state unwritten)
function learningOf(sport, checks) {
  try {
    const l = checkLearning(checks);
    const causes = Object.entries(l.byCause).map(([k, t]) => `${k} ${t.won}-${t.lost}${t.push ? `-${t.push}` : ''} ${t.profit >= 0 ? '+' : ''}${t.profit}u`);
    if (l.graded) console.log(`${sport}: CHECKs graded by cause: ${causes.join(', ')}`);
    for (const x of l.recommendations.slice(0, 5)) console.log(`${sport}: CHECK advice ${x.rank}. ${x.text}`);
    return l;
  } catch (err) {
    console.warn(`${sport}: the CHECKs' learning skipped (${err.message})`);
    return null;
  }
}

// The state: the settings and how they test, the trust, the context, the props, the changelog, the teams by
// rating; written with the ledger (--dry: the snapshot instead)
function saveState(r) {
  const { sport, cfg, state, history, ctxFit, best, ledger, trust, at } = r;
  // (the bets priced again on news: how many taken back, how many placed again, and what changed by game)
  if (r.takenBack?.size && !DRY) {
    const back = [...r.takenBack.values()];
    const again = back.filter((x) => r.ledger.bets.some((b) => b.id === x.bet.id && b.repriced)).length;
    const games = [...new Set(back.map((x) => `${x.bet.matchup}: ${x.why.join('; ')}`))];
    const why = `What they were priced on changed before the start: ${games.join(' | ')}`;
    state.changelog.push({ at, what: 'Open bets priced again on news', from: back.length, to: again, why: why.length > 600 ? `${why.slice(0, 597)}...` : why });
  }
  if (r.replaced) state.changelog.push({ at, what: 'Open bets replaced', from: r.replaced, to: r.newBets, why: 'Priced again with the context the model has now (its terms as fit this run: see Context)' });
  if (r.madeRoom && !DRY) state.changelog.push({ at, what: 'Action bets taken back for room', from: r.madeRoom, to: 0, why: `Open action bets (no edge) taken back so this run's edge bets on their games fit the ${GAME_CAP}u cap` });
  const abbr = new Map();
  for (const g of history) {
    abbr.set(g.home, g.homeAbbr);
    abbr.set(g.away, g.awayAbbr);
  }
  const testOf = (t) => ({ games: t.n, maeMargin: round(t.maeMargin), maeTotal: round(t.maeTotal), winHit: round(t.winHit, 4), winLogLoss: round(t.winLogLoss, 4) });
  Object.assign(state, {
    sport,
    label: cfg.label,
    updated: at,
    params: r.params,
    // (the whole model's: the ratings with the context; context.test has them without it too)
    test: ctxFit ? testOf(ctxFit.after) : best ? testOf(best.test) : null,
    trust,
    evScale: EV_SCALE,
    gameCap: GAME_CAP,
    // (the same-game sizing, desk.mjs sameGameOf: the props' correlation in a game, fit, used and its replay)
    sameGame: r.sameGame ?? state.sameGame ?? null,
    // (the model's latest major change, leagues.mjs: the trust is fit only on bets since; the Bets About shows it)
    epoch: MODEL_EPOCH,
    // (the margins' shape, margins.mjs: kept or not, what it did for the held-out finals, its weights)
    margins: r.margins ? { ties: r.margins.ties, ot: r.margins.ot, kept: r.margins.kept, gain: r.margins.gain, n: r.margins.n, w: r.margins.w } : (state.margins ?? null),
    context: r.context,
    // (each source's time this run and whether it was asked: needed, a re-test, or skipped)
    sources: Object.fromEntries([...new Set([...Object.keys(r.times ?? {}), ...Object.keys(r.asked ?? {})])].map((k) => [k, { ...(r.times?.[k] ?? {}), asked: r.asked?.[k] ?? 'always', feeds: OPTIONAL[sport]?.[k] ?? null }])),
    props: r.props
      ? {
          odds: "DraftKings' prices where the board has them (NBA, NHL, MLB); else -110 a side assumed, lines far from the player's usual not bet (NFL)",
          perGame: PER_GAME,
          lastRun: r.propRun,
          // (the NFL's questionable regulars' chance of playing (playchance.mjs): the share who played, the levels
          // kept and their held-out check as read live (each side's; a side at half), and the chance by a
          // quarterback or not and his games missed in a row, as read tonight (no practice: ESPN's report doesn't
          // carry it; measured, not read))
          ...(r.playChance ? { playChance: playChanceSummary(r.playChance) } : {}),
          types: Object.entries(r.props).map(([key, f]) => ({ key, label: f.stat.label, rows: f.rows, eligible: f.eligible, params: { ...f.params, roleK: Number.isFinite(f.params.roleK) ? f.params.roleK : null }, gains: f.gains, base: f.base, check: f.check, allPlayersBias: f.checkAll?.bias ?? null, trust: trust[`prop:${key}`] ?? null })),
        }
      : (state.props ?? null),
    postmortem: (() => {
      const done = ledger.bets.filter((b) => b.status !== 'open' && !b.void && b.why);
      return { graded: done.length, disrupted: done.filter((b) => (b.weight ?? 1) < 1).length, weight: DISRUPTED_WEIGHT, fitted: false };
    })(),
    history: { games: history.length, finals: history.filter((g) => g.final).length, from: history[0]?.date ?? null },
    teams: [...r.teams.r.entries()]
      .map(([id, rating]) => ({ id, abbr: abbr.get(id) ?? id, rating: round(rating, 2), off: round(r.teams.o.get(id), 2), def: round(r.teams.d.get(id), 2) }))
      .sort((a, b) => b.rating - a.rating),
    record: record(ledger.bets),
    // (the markets tracked, not bet (desk.mjs TRACK: no edge), at a unit each, as if bet: never in the record)
    tracked: trackedRecord(ledger.bets),
    // (the CHECKs: too far from the market to bet, graded as if they were: checks.mjs; their hit rate and the
    // owner's notes' reasons, for tuning the gap)
    // (checks.json unreadable: the last good tally kept, flagged, rather than one of this run's alone)
    // (and what drives them: each graded one's cause, its hit rate and the recommendations they make,
    // check-learn.mjs checkLearning; the Algorithm tab's CHECKs panel and the weekly self-check read it)
    checks: r.checksUnreadable ? { ...(state.checks ?? {}), unreadable: true } : { ...checkSummary(ledger.checks ?? []), learning: learningOf(r.sport, ledger.checks ?? []) },
    // (the lines' source this run, and The Odds API's credits)
    lines: r.linesSource,
    backtest: r.backtest,
    book: BOOK,
    odds: hasKey() ? usageSummary() : null,
    clv: { all: clvSummary(ledger.bets), ...Object.fromEntries([...MARKETS, 'prop'].map((m) => [m, clvSummary(ledger.bets.filter((b) => b.market === m))])) },
  });
  state.changelog = state.changelog.slice(-200);
  if (!DRY) {
    writeIfChanged(r.files.state, state);
    writeLedger(r, ledger);
  } else {
    write(path.join(ROOT, '.cache/model', `dry-${sport}.json`), {
      params: state.params,
      terms: (state.context?.terms ?? []).map((t) => [t.key, t.size, t.kept, t.gain, t.games]),
      propTypes: state.props?.types?.map((t) => ({ key: t.key, params: t.params, gains: t.gains, base: t.base?.logLoss, check: t.check?.logLoss, bias: t.check?.bias, allBias: t.allPlayersBias, rows: t.rows, eligible: t.eligible })) ?? null,
      props: state.props?.types?.map((t) => [t.key, t.params]) ?? null,
      trust: state.trust,
      ...r.snapshot,
    });
    console.log(`${sport} (dry): snapshot in .cache/model/dry-${sport}.json`);
  }
  console.log(`${sport}: ${history.length} games kept; ${r.graded} bets graded, ${r.newBets - (r.newTracked ?? 0)} placed, ${r.newTracked ?? 0} tracked; record ${state.record.won}-${state.record.lost}-${state.record.push}, ${state.record.profit >= 0 ? '+' : ''}${state.record.profit}u`);
}

// The context as the state shows it: each term's fitted size (in the sport's unit, per unit of the term),
// whether it earned its place, how many games had it, what it was worth on the held-out games; the test
// numbers with and without it
function contextState(fitted, weights) {
  const test = (r) => ({ maeMargin: round(r.maeMargin, 3), maeTotal: round(r.maeTotal, 3), winHit: round(r.winHit, 4), winLogLoss: round(r.winLogLoss, 4) });
  const sig = (v) => (v ? Number(v.toPrecision(2)) : 0);
  const each = ['m', 't'].flatMap((on) =>
    fitted.ctx.terms[on].map((t, i) => ({
      key: t.key,
      gate: t.gate ?? null,
      label: t.label,
      group: t.group,
      on: on === 'm' ? 'margin' : 'total',
      unit: t.unit,
      size: sig(weights?.[on][i] ?? 0),
      kept: !fitted.ctx.off.has(gateOf(t)),
      games: fitted.seen[on][i],
      gain: fitted.gain[gateOf(t)] === undefined ? null : round(fitted.gain[gateOf(t)] * 100, 3),
    })),
  );
  // (a park's set shows as one row per side it moves: its biggest size, and the parks that lean most)
  const terms = each.filter((t) => !t.gate);
  for (const gate of [...new Set(each.filter((t) => t.gate).map((t) => t.gate))]) {
    for (const on of ['margin', 'total']) {
      const set = each.filter((t) => t.gate === gate && t.on === on);
      if (!set.length) continue;
      const top = [...set].sort((a, b) => Math.abs(b.size) - Math.abs(a.size));
      terms.push({
        key: `${gate}:${on}`,
        label: gate === 'park' ? 'Ballparks' : on === 'margin' ? 'Ballparks by hand' : 'Ballparks by hand (total)',
        group: 'park',
        on,
        unit: `${set[0].unit.replace('this park', 'each park')} (${set.length} parks; most: ${top
          .slice(0, 3)
          .map((t) => `${t.label} ${t.size > 0 ? '+' : ''}${t.size}`)
          .join(', ')})`,
        size: top[0].size,
        kept: set[0].kept,
        games: set.reduce((s, t) => s + t.games, 0),
        gain: set[0].gain,
        parks: Object.fromEntries(set.map((t) => [t.label, t.size])),
      });
    }
  }
  return { lambda: fitted.ctx.lambda, lambdaParks: fitted.ctx.lambdaSet ?? undefined, terms, test: { games: fitted.after.n, before: test(fitted.before), after: test(fitted.after) } };
}

const DRY = process.argv.includes('--dry');
const REPLACE = process.argv.includes('--replace');
// (--all-sources: every optional source asked this run, kept terms or not: a re-test by hand)
const ALL_SOURCES = process.argv.includes('--all-sources');
// (--backtest: the backtest's historical snapshots bought, within history's budget: backtest.mjs)
const BACKTEST = process.argv.includes('--backtest');
// (--picks-only: only the picks, from the ledger as it is: no fetching, fitting or betting)
const PICKS_ONLY = process.argv.includes('--picks-only');
// (--board-out=<dir>: a dry run's betting board written there, to check: writeBoard)
const BOARD_OUT = process.argv.find((a) => a.startsWith('--board-out='))?.slice(12) ?? null;
// (the runs' recent gap, hours: set below, before any sport runs; null with too few runs kept)
let GAP = null;
// (the owner's notes, read once a process: notes.mjs readDeskNotes)
let NOTES = null;
// (only when run as the script itself: imported (a check, a test), it bets nothing and asks nothing)
if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const sports = args.length ? args : Object.keys(LEAGUES);
  // (the runs' recent gap, before this one is added; a run that's only the picks doesn't count)
  const runs = read(RUNS, []);
  GAP = cadenceOf(Array.isArray(runs) ? runs : []);
  if (!DRY && !PICKS_ONLY) write(RUNS, [...(Array.isArray(runs) ? runs : []), new Date().toISOString()].slice(-24));
  for (const sport of sports) {
    try {
      await runSport(sport);
    } catch (err) {
      console.error(`${sport}: ${err.stack ?? err}`);
      process.exitCode = 1;
    }
  }
}
